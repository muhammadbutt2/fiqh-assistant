import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import { defaultAnswerLocale, isSupportedLanguage, listLocales } from "@/data/languages";
import { detectLanguage } from "@/server/detect";
import { INSTITUTIONS, normalizeInstitution } from "@/data/sources";
import { answerQuestion } from "@/server/answer";
import { diagnoseRetrieval } from "@/server/diagnose";
import { processQuestion } from "@/server/query";
import { checkPermittedPage } from "@/server/source-check";
import { retrievalTestRecord, trialSearchInstitution } from "@/server/websites";
import type { ChatClient, Translator } from "@/server/ai";
import { applyReview, processJob, processQueuedJobs, storeUpload } from "@/server/ingest";
import { MADHHABS, parseMadhhab } from "@/server/madhhab";
import { clientKey, createRateLimiter, detectUpload, hashPassword, passwordsEqual, sessionFromRequest, signSession, verifyPassword } from "@/server/security";
import type { Store } from "@/server/store";
import type { StoredChunk } from "@/server/types";

export type AppDeps = {
  store: Store;
  chat: ChatClient;
  translator: Translator;
  authSecret: string | null;
  adminPassword: string | null;
  storageDir: string;
  maxUploadBytes: number;
  rateLimit: (key: string) => boolean;
};

const askSchema = z.object({
  madhhab: z.string(),
  /** One of en, ur, ar. When omitted, the detected question language is used if it is supported, else English. */
  answerLocale: z.string().optional(),
  question: z.string().min(1).max(4000).optional(),
  queryLanguage: z.string().optional(),
  acceptUncertainDetection: z.boolean().optional(),
  previousQuestionId: z.string().optional(),
});

function envDefaultLocale(): "en" | "ur" | "ar" {
  const configured = process.env.DEFAULT_ANSWER_LOCALE;
  return isSupportedLanguage(configured) ? configured : "en";
}

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...Object.fromEntries(new Headers(headers)) },
  });
}

export async function getStatus(deps: AppDeps): Promise<Response> {
  const stats = await deps.store.stats();
  return json({
    libraryPopulated: stats.libraryPopulated === true,
    approvedChunks: stats.indexedChunks,
    answerGeneration: deps.chat.available() ? "configured" : "unavailable",
    semanticRetrieval: "unavailable",
    madhhabs: MADHHABS,
  });
}

export async function postAsk(request: Request, deps: AppDeps): Promise<Response> {
  if (!deps.rateLimit(clientKey(request))) return json({ error: "RATE_LIMIT" }, 429);
  const parsed = askSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "INVALID_REQUEST" }, 400);
  const started = Date.now();
  const requestId = randomUUID();
  try {
    const session = sessionFromRequest(request, deps.authSecret);
    let question = parsed.data.question ?? "";
    let frozen: StoredChunk[] | undefined;
    if (parsed.data.previousQuestionId) {
      const previous = await deps.store.getExchange(parsed.data.previousQuestionId);
      if (!previous) return json({ error: "NOT_FOUND" }, 404);
      if (previous.madhhab !== parsed.data.madhhab) return json({ error: "MADHHAB_RESET_REQUIRED" }, 409);
      question = previous.question;
      const ids = new Set(previous.chunkIds);
      frozen = (await deps.store.listChunks()).filter((chunk) => ids.has(chunk.id));
    }
    if (!question) return json({ error: "INVALID_REQUEST" }, 400);
    if (parsed.data.answerLocale !== undefined && !isSupportedLanguage(parsed.data.answerLocale)) return json({ error: "INVALID_LOCALE" }, 400);
    const answerLocale = parsed.data.answerLocale ?? defaultAnswerLocale(parsed.data.queryLanguage ?? detectLanguage(question).language, envDefaultLocale());
    const stats = await deps.store.stats();
    const answer = await answerQuestion({
      madhhab: parsed.data.madhhab,
      answerLocale,
      question,
      queryLanguage: parsed.data.queryLanguage,
      acceptUncertainDetection: parsed.data.acceptUncertainDetection,
      chunks: await deps.store.listChunks(),
      frozenChunks: frozen,
      institutions: await deps.store.listInstitutions(),
      allowTestFixtures: false,
      libraryEmpty: stats.libraryPopulated !== true,
      chat: deps.chat,
      translator: deps.translator,
      signal: request.signal,
    });
    const id = randomUUID();
    await deps.store.saveExchange({
      id,
      userId: session?.role === "user" ? session.sub : null,
      question,
      questionSha256: createHash("sha256").update(question).digest("hex"),
      madhhab: parseMadhhab(parsed.data.madhhab),
      answerLocale,
      chunkIds: answer.sourceIds,
      answer,
      createdAt: new Date().toISOString(),
    });
    await deps.store.writeAudit({
      id: randomUUID(),
      requestId,
      madhhab: answer.madhhab,
      detectedLanguage: answer.detectedQueryLanguage,
      answerLanguage: answer.preferredAnswerLanguage,
      retrievalLanguages: answer.retrievalLanguages.join(","),
      sourceIds: answer.sourceIds.join(","),
      latencyMs: Date.now() - started,
      provider: deps.chat.id,
      model: deps.chat.model,
      translationMethod: answer.translationMethod,
      citationValidation: answer.answerStatus === "answered" ? "passed" : "not_a_generated_ruling",
      answerStatus: answer.answerStatus,
      errorCode: null,
      questionSha256: createHash("sha256").update(question).digest("hex"),
      createdAt: new Date().toISOString(),
    });
    return json({ id, ...answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "REQUEST_FAILED";
    if (message === "CANCELLED") return json({ error: "CANCELLED" }, 400);
    if (message === "INVALID_MADHHAB" || message === "INVALID_LOCALE") return json({ error: message }, 400);
    return json({ error: "REQUEST_FAILED" }, 500);
  }
}

export async function postFeedback(request: Request, deps: AppDeps): Promise<Response> {
  const body = z.object({ answerId: z.string().optional(), kind: z.enum(["incorrect_citation", "incorrect_answer"]), note: z.string().max(2000).optional() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "INVALID_REQUEST" }, 400);
  const session = sessionFromRequest(request, deps.authSecret);
  await deps.store.addFeedback({
    id: randomUUID(),
    answerId: body.data.answerId ?? null,
    userId: session?.sub ?? null,
    kind: body.data.kind,
    note: body.data.note ?? "",
    createdAt: new Date().toISOString(),
  });
  return json({ accepted: true, reviewPromised: false });
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(200),
  madhhab: z.string().optional(),
  answerLocale: z.string().optional(),
});

export async function postRegister(request: Request, deps: AppDeps): Promise<Response> {
  if (!deps.authSecret) return json({ error: "AUTH_NOT_CONFIGURED" }, 503);
  const body = registerSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "INVALID_REQUEST" }, 400);
  const id = randomUUID();
  try {
    await deps.store.createUser({ id, email: body.data.email.toLowerCase(), passwordHash: hashPassword(body.data.password), createdAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_IN_USE") return json({ error: "EMAIL_IN_USE" }, 409);
    throw error;
  }
  if (body.data.madhhab || body.data.answerLocale) {
    await deps.store.upsertPreference({
      userId: id,
      madhhab: body.data.madhhab ? parseMadhhab(body.data.madhhab) : null,
      answerLocale: body.data.answerLocale ?? null,
    });
  }
  return sessionResponse({ id, role: "user" }, deps, { created: true });
}

export async function postLogin(request: Request, deps: AppDeps): Promise<Response> {
  if (!deps.authSecret) return json({ error: "AUTH_NOT_CONFIGURED" }, 503);
  const body = z.object({ email: z.string().email(), password: z.string() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "INVALID_REQUEST" }, 400);
  const user = await deps.store.findUserByEmail(body.data.email.toLowerCase());
  if (!user || !verifyPassword(body.data.password, user.passwordHash)) return json({ error: "UNAUTHENTICATED" }, 401);
  return sessionResponse({ id: user.id, role: "user" }, deps, { created: false });
}

export async function postLogout(): Promise<Response> {
  return json({ ok: true }, 200, { "Set-Cookie": "fiqh_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax" });
}

export async function deleteAccount(request: Request, deps: AppDeps): Promise<Response> {
  const session = sessionFromRequest(request, deps.authSecret);
  if (!session || session.role !== "user") return json({ error: "UNAUTHENTICATED" }, 401);
  await deps.store.deleteUser(session.sub);
  return json({ deleted: true }, 200, { "Set-Cookie": "fiqh_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax" });
}

export async function getPreferences(request: Request, deps: AppDeps): Promise<Response> {
  const session = sessionFromRequest(request, deps.authSecret);
  if (!session || session.role !== "user") return json({ error: "UNAUTHENTICATED" }, 401);
  return json({ preference: await deps.store.getPreference(session.sub) });
}

export async function putPreferences(request: Request, deps: AppDeps): Promise<Response> {
  const session = sessionFromRequest(request, deps.authSecret);
  if (!session || session.role !== "user") return json({ error: "UNAUTHENTICATED" }, 401);
  const body = z.object({ madhhab: z.string().nullable(), answerLocale: z.string().nullable() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "INVALID_REQUEST" }, 400);
  const preference = {
    userId: session.sub,
    madhhab: body.data.madhhab ? parseMadhhab(body.data.madhhab) : null,
    answerLocale: body.data.answerLocale,
  };
  if (preference.answerLocale && !listLocales().some((locale) => locale.localeId === preference.answerLocale)) return json({ error: "INVALID_LOCALE" }, 400);
  await deps.store.upsertPreference(preference);
  return json({ preference });
}

export async function postAdminLogin(request: Request, deps: AppDeps): Promise<Response> {
  if (!deps.authSecret || !deps.adminPassword) return json({ error: "ADMIN_NOT_CONFIGURED" }, 503);
  const body = z.object({ password: z.string() }).safeParse(await request.json().catch(() => null));
  if (!body.success || !passwordsEqual(body.data.password, deps.adminPassword)) return json({ error: "UNAUTHENTICATED" }, 401);
  return sessionResponse({ id: "admin", role: "admin" }, deps, { created: false });
}

function requireAdmin(request: Request, deps: AppDeps): Response | null {
  if (!deps.authSecret || !deps.adminPassword) return json({ error: "ADMIN_NOT_CONFIGURED" }, 503);
  const session = sessionFromRequest(request, deps.authSecret);
  if (!session || session.role !== "admin") return json({ error: "UNAUTHENTICATED" }, 401);
  return null;
}

export async function getAdminStats(request: Request, deps: AppDeps): Promise<Response> {
  const denied = requireAdmin(request, deps);
  if (denied) return denied;
  return json(await deps.store.stats());
}

export async function getAdminSources(request: Request, deps: AppDeps): Promise<Response> {
  const denied = requireAdmin(request, deps);
  if (denied) return denied;
  return json({
    documents: (await deps.store.listDocuments()).map((document) => ({
      id: document.id,
      title: document.title,
      author: document.author,
      madhhab: document.madhhab,
      sourceClass: document.sourceClass,
      language: document.language,
      sha256: document.sha256,
      format: document.format,
      rightsStatus: document.rightsStatus,
      verificationStatus: document.verificationStatus,
      trustClassification: document.trustClassification,
      ocrStatus: document.ocrStatus,
      searchable: document.searchable,
      isTestFixture: document.isTestFixture,
      notes: document.notes,
      url: document.url,
      fatwaNumber: document.fatwaNumber,
      volume: document.volume,
      editionLabel: document.editionLabel,
      workId: document.workId,
      verificationNote: document.verificationNote,
      methodology: document.methodology,
      checkedOn: document.checkedOn,
    })),
    institutions: await deps.store.listInstitutions(),
    acquisitions: await deps.store.listAcquisitions(),
    jobs: await deps.store.listJobs(),
  });
}

export async function postAdminUpload(request: Request, deps: AppDeps): Promise<Response> {
  const denied = requireAdmin(request, deps);
  if (denied) return denied;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "INVALID_REQUEST" }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let format: ReturnType<typeof detectUpload>;
  try {
    format = detectUpload(file.name, bytes, deps.maxUploadBytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_REQUEST";
    return json({ error: message }, 400);
  }
  const madhhab = parseMadhhab(String(form.get("madhhab") ?? ""));
  const sourceClass = String(form.get("sourceClass") ?? "primary");
  if (!["primary", "institutional_fatwa", "secondary", "comparative", "unverified"].includes(sourceClass)) return json({ error: "INVALID_REQUEST" }, 400);
  let stored: Awaited<ReturnType<typeof storeUpload>>;
  try {
    stored = await storeUpload({
      storageDir: deps.storageDir,
      bytes,
      format,
      store: deps.store,
      metadata: {
        title: String(form.get("title") ?? file.name),
        author: String(form.get("author") ?? ""),
        madhhab,
        sourceClass: sourceClass as "primary",
        language: String(form.get("language") ?? "und"),
        format,
        rightsStatus: "rights_review_required",
        verificationStatus: "pending",
        trustClassification: "pending",
        notes: String(form.get("notes") ?? ""),
        url: null,
        fatwaNumber: null,
        volume: null,
        editionLabel: String(form.get("edition") ?? "") || null,
        workId: null,
        verificationNote: "",
        methodology: "",
        checkedOn: "",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_FILE") return json({ error: "DUPLICATE_FILE" }, 409);
    throw error;
  }
  const { document, job } = stored;
  await processJob(deps.store, job.id);
  const finished = (await deps.store.listJobs()).find((item) => item.id === job.id);
  return json({ documentId: document.id, job: finished, storagePath: undefined }, 201);
}

export async function postAdminReview(request: Request, deps: AppDeps): Promise<Response> {
  const denied = requireAdmin(request, deps);
  if (denied) return denied;
  const body = z.object({
    documentId: z.string(),
    trustClassification: z.enum(["approved", "pending", "untrusted"]).optional(),
    rightsStatus: z.enum(["approved_for_ingestion", "rights_review_required", "unknown", "rejected"]).optional(),
    verificationNote: z.string().optional(),
    methodology: z.string().optional(),
    checkedOn: z.string().optional(),
    title: z.string().optional(),
    author: z.string().optional(),
    editionLabel: z.string().nullable().optional(),
  }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "INVALID_REQUEST" }, 400);
  const current = (await deps.store.listDocuments()).find((item) => item.id === body.data.documentId);
  if (!current) return json({ error: "NOT_FOUND" }, 404);
  try {
    const patch = applyReview(current, body.data);
    const updated = await deps.store.updateDocument(current.id, patch);
    return json({ documentId: updated.id, searchable: updated.searchable });
  } catch (error) {
    if (error instanceof Error && error.message === "VERIFICATION_REQUIRED") return json({ error: "VERIFICATION_REQUIRED" }, 400);
    throw error;
  }
}

export async function postAdminRetry(request: Request, deps: AppDeps): Promise<Response> {
  const denied = requireAdmin(request, deps);
  if (denied) return denied;
  const body = z.object({ jobId: z.string() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "INVALID_REQUEST" }, 400);
  const job = (await deps.store.listJobs()).find((item) => item.id === body.data.jobId);
  if (!job) return json({ error: "NOT_FOUND" }, 404);
  if (job.attempts >= 3) return json({ error: "RETRY_LIMIT" }, 400);
  await deps.store.updateJob(job.id, { status: "queued", attempts: job.attempts + 1, error: null });
  await processJob(deps.store, job.id);
  return json({ job: (await deps.store.listJobs()).find((item) => item.id === job.id) });
}

export async function postInstitutionReview(request: Request, deps: AppDeps): Promise<Response> {
  const denied = requireAdmin(request, deps);
  if (denied) return denied;
  const body = z.object({
    id: z.string(),
    trustedPool: z.array(z.enum(MADHHABS)).optional(),
    reviewerNote: z.string().optional(),
    checkedOn: z.string().optional(),
    methodology: z.string().optional(),
    retrievalAllowed: z.boolean().optional(),
    testQuestion: z.string().min(1).max(4000).optional(),
    termsReviewStatus: z.enum(["unreviewed", "reviewed_query_time_link", "rejected"]).optional(),
  }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "INVALID_REQUEST" }, 400);
  const needsReview = (body.data.trustedPool?.length ?? 0) > 0 || body.data.retrievalAllowed === true;
  if (needsReview && (!body.data.reviewerNote || !body.data.checkedOn || !body.data.methodology)) {
    return json({ error: "VERIFICATION_REQUIRED" }, 400);
  }
  const current = (await deps.store.listInstitutions()).find((item) => item.id === body.data.id) ?? INSTITUTIONS.find((item) => item.id === body.data.id);
  if (!current) return json({ error: "NOT_FOUND" }, 404);
  const trustedPool = body.data.trustedPool ?? current.trustedPool;
  const termsReviewStatus = body.data.termsReviewStatus ?? current.termsReviewStatus ?? "unreviewed";
  let lastRetrievalTest = current.lastRetrievalTest ?? null;
  if (body.data.retrievalAllowed === true) {
    if (current.reviewStatus === "excluded") return json({ error: "INSTITUTION_EXCLUDED" }, 400);
    if (current.reviewStatus !== "identity_checked") return json({ error: "IDENTITY_NOT_CHECKED" }, 400);
    if (trustedPool.length === 0) return json({ error: "TRUSTED_POOL_REQUIRED" }, 400);
    if (termsReviewStatus !== "reviewed_query_time_link") return json({ error: "TERMS_REVIEW_REQUIRED" }, 400);
    if ((current.retrievalMethod ?? "none") === "none" && !current.searchTemplate) {
      return json({ error: "NO_RETRIEVAL_METHOD" }, 400);
    }
    if (!body.data.testQuestion) return json({ error: "TEST_QUESTION_REQUIRED" }, 400);
    const trial = normalizeInstitution({ ...current, retrievalAllowed: true, trustedPool, termsReviewStatus });
    const report = await trialSearchInstitution({
      institution: trial,
      madhhab: trustedPool[0] as (typeof MADHHABS)[number],
      question: body.data.testQuestion,
      limit: 2,
    });
    lastRetrievalTest = retrievalTestRecord(report, trial.retrievalMethod ?? "none");
    if (!lastRetrievalTest.ok) return json({ error: "RETRIEVAL_TEST_FAILED", lastRetrievalTest, report: { queries: report.queries, skipped: report.skipped, hits: report.hits } }, 400);
  }
  const updated = await deps.store.updateInstitution(body.data.id, {
    trustedPool,
    methodology: body.data.methodology ?? current.methodology,
    lastChecked: body.data.checkedOn ?? current.lastChecked,
    notes: body.data.reviewerNote ? `${current.notes} Reviewer note: ${body.data.reviewerNote}` : current.notes,
    retrievalAllowed: body.data.retrievalAllowed ?? current.retrievalAllowed,
    termsReviewStatus,
    lastRetrievalTest,
  });
  return json({ institution: updated });
}

export async function postWebsiteTest(request: Request, deps: AppDeps): Promise<Response> {
  const denied = requireAdmin(request, deps);
  if (denied) return denied;
  const body = z.object({
    institutionId: z.string(),
    question: z.string().min(1).max(4000),
    madhhab: z.string(),
    offDomainUrl: z.string().optional(),
  }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "INVALID_REQUEST" }, 400);
  const madhhab = parseMadhhab(body.data.madhhab);
  const listed = await deps.store.listInstitutions();
  const current = listed.find((item) => item.id === body.data.institutionId);
  if (!current) return json({ error: "NOT_FOUND" }, 404);
  const processed = processQuestion(body.data.question);
  const trial = normalizeInstitution({ ...current, retrievalAllowed: true, trustedPool: current.trustedPool.length > 0 ? current.trustedPool : [madhhab] });
  const report = await trialSearchInstitution({
    institution: trial,
    madhhab,
    question: body.data.question,
    limit: 3,
  });
  const offDomain = await checkPermittedPage(trial, body.data.offDomainUrl ?? "https://evil.example/fatwa");
  const lastRetrievalTest = retrievalTestRecord(report, trial.retrievalMethod ?? "none");
  await deps.store.updateInstitution(current.id, { lastRetrievalTest });
  return json({
    institutionId: current.id,
    domain: current.domain,
    retrievalAllowed: current.retrievalAllowed,
    retrievalMethod: trial.retrievalMethod,
    pathAllowlist: trial.pathAllowlist,
    termsReviewStatus: trial.termsReviewStatus,
    identityVerificationStatus: current.reviewStatus,
    detectedLanguage: processed.detectedLanguage,
    arabicQuery: processed.arabicQuery,
    urduQuery: processed.urduQuery,
    queries: report.queries,
    searched: report.searched,
    skipped: report.skipped,
    hits: report.hits,
    pagesRetrieved: report.hits.filter((hit) => !hit.snippetOnly).length,
    offDomainRejected: !offDomain.ok,
    offDomain: offDomain.ok ? null : offDomain,
    lastRetrievalTest,
    retrievedAt: lastRetrievalTest.at,
    live: true,
    enabled: false,
  });
}

export async function postAdminDiagnose(request: Request, deps: AppDeps): Promise<Response> {
  const denied = requireAdmin(request, deps);
  if (denied) return denied;
  const body = z.object({
    question: z.string().min(1).max(4000),
    madhhab: z.string(),
  }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "INVALID_REQUEST" }, 400);
  const report = await diagnoseRetrieval({
    question: body.data.question,
    madhhab: parseMadhhab(body.data.madhhab),
    chunks: await deps.store.listChunks(),
    institutions: await deps.store.listInstitutions(),
  });
  return json(report);
}

export async function getJobs(request: Request, deps: AppDeps): Promise<Response> {
  const denied = requireAdmin(request, deps);
  if (denied) return denied;
  await processQueuedJobs(deps.store);
  return json({ jobs: await deps.store.listJobs() });
}

function sessionResponse(user: { id: string; role: "admin" | "user" }, deps: AppDeps, body: Record<string, unknown>): Response {
  const token = signSession({ sub: user.id, role: user.role, exp: Date.now() + 12 * 60 * 60 * 1000 }, deps.authSecret ?? "");
  return json(body, 200, {
    "Set-Cookie": `fiqh_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax`,
  });
}

export function defaultRateLimit(): (key: string) => boolean {
  const limit = Number(process.env.ASK_RATE_LIMIT_PER_HOUR ?? 30);
  return createRateLimiter(Number.isFinite(limit) ? limit : 30, 60 * 60 * 1000);
}
