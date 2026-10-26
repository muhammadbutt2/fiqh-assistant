import { Prisma, PrismaClient } from "@prisma/client";
import { EXPECTED_WORKS, INSTITUTIONS, QUDURI_CATALOGUE_CANDIDATES, statusForWork, type Institution } from "@/data/sources";
import type { Madhhab } from "@/server/madhhab";
import type { AcquisitionRecord, AuditRecord, ExchangeRecord, FeedbackRecord, JobRecord, PreferenceRecord, Store, StoredDocument, UserRecord } from "@/server/store";
import type { PublicAnswer, StoredChunk } from "@/server/types";

const globalPrisma = globalThis as { fiqhPrisma?: PrismaClient };

function db(): PrismaClient {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  globalPrisma.fiqhPrisma ??= new PrismaClient();
  return globalPrisma.fiqhPrisma;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asChunk(row: {
  id: string; documentId: string; madhhab: Madhhab; sourceClass: string; language: string;
  originalText: string; normalizedText: string; chapterPath: unknown; volume: number | null;
  printedPageStart: number | null; printedPageEnd: number | null; pdfPageStart: number; pdfPageEnd: number;
  ocrQuality: string; searchable: boolean; trustClassification: string; verificationStatus: string;
  rightsStatus: string; isTestFixture: boolean; url: string | null; fatwaNumber: string | null;
  title: string; author: string; editionLabel: string | null; opinionLabels: unknown;
  comparativeAppliesTo: unknown; translation: unknown; embedding: unknown; workId: string | null; editionId: string | null;
}): StoredChunk {
  const translation = row.translation && typeof row.translation === "object" ? row.translation as { language?: string; text?: string } : null;
  return {
    id: row.id,
    documentId: row.documentId,
    workId: row.workId,
    editionId: row.editionId,
    madhhab: row.madhhab,
    comparativeAppliesTo: Array.isArray(row.comparativeAppliesTo) ? row.comparativeAppliesTo.filter((item): item is Madhhab => item === "hanafi" || item === "maliki" || item === "shafii" || item === "hanbali") : [],
    opinionLabels: Array.isArray(row.opinionLabels) ? row.opinionLabels.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as { madhhab?: string; label?: string };
      if (record.madhhab === "hanafi" || record.madhhab === "maliki" || record.madhhab === "shafii" || record.madhhab === "hanbali") {
        return [{ madhhab: record.madhhab, label: String(record.label ?? "") }];
      }
      return [];
    }) : [],
    sourceClass: row.sourceClass as StoredChunk["sourceClass"],
    language: row.language,
    volume: row.volume,
    printedPageStart: row.printedPageStart,
    printedPageEnd: row.printedPageEnd,
    pdfPageStart: row.pdfPageStart,
    pdfPageEnd: row.pdfPageEnd,
    chapterPath: Array.isArray(row.chapterPath) ? row.chapterPath.filter((item): item is string => typeof item === "string") : [],
    originalText: row.originalText,
    normalizedText: row.normalizedText,
    translation: translation?.text ? { language: translation.language ?? "", text: translation.text, status: "supplied_metadata" } : null,
    ocrQuality: row.ocrQuality as StoredChunk["ocrQuality"],
    rightsStatus: row.rightsStatus as StoredChunk["rightsStatus"],
    verificationStatus: row.verificationStatus as StoredChunk["verificationStatus"],
    trustClassification: row.trustClassification as StoredChunk["trustClassification"],
    searchable: row.searchable,
    url: row.url,
    fatwaNumber: row.fatwaNumber,
    title: row.title,
    author: row.author,
    editionLabel: row.editionLabel,
    isTestFixture: row.isTestFixture,
    embedding: Array.isArray(row.embedding) ? row.embedding.filter((item): item is number => typeof item === "number") : null,
  };
}

function asDocument(row: {
  id: string; title: string; authorName: string; madhhab: Madhhab; sourceClass: string; language: string;
  sha256: string; format: string; storagePath: string; rightsStatus: string; verificationStatus: string;
  trustClassification: string; ocrStatus: string; searchable: boolean; isTestFixture: boolean; notes: string | null;
  url: string | null; fatwaNumber: string | null; volume: number | null; editionLabel: string | null; workId?: string | null;
  verificationNote: string; methodology: string; checkedOn: string;
}): StoredDocument {
  return {
    id: row.id,
    title: row.title,
    author: row.authorName,
    madhhab: row.madhhab,
    sourceClass: row.sourceClass as StoredDocument["sourceClass"],
    language: row.language,
    sha256: row.sha256,
    format: row.format,
    storagePath: row.storagePath,
    rightsStatus: row.rightsStatus as StoredDocument["rightsStatus"],
    verificationStatus: row.verificationStatus as StoredDocument["verificationStatus"],
    trustClassification: row.trustClassification as StoredDocument["trustClassification"],
    ocrStatus: row.ocrStatus,
    searchable: row.searchable,
    isTestFixture: row.isTestFixture,
    notes: row.notes ?? "",
    url: row.url,
    fatwaNumber: row.fatwaNumber,
    volume: row.volume,
    editionLabel: row.editionLabel,
    workId: null,
    verificationNote: row.verificationNote,
    methodology: row.methodology,
    checkedOn: row.checkedOn,
  };
}

export function createPrismaStore(): Store {
  const client = db();
  return {
    async listChunks() {
      return (await client.chunk.findMany({ take: 2000, where: { isTestFixture: false } })).map(asChunk);
    },
    async saveDocument(document, chunks) {
      await client.chunk.deleteMany({ where: { documentId: document.id } });
      await client.document.upsert({
        where: { id: document.id },
        create: documentData(document),
        update: documentData(document),
      });
      if (chunks.length > 0) {
        await client.chunk.createMany({
          data: chunks.map((chunk) => ({
            id: chunk.id,
            documentId: chunk.documentId,
            madhhab: chunk.madhhab,
            sourceClass: chunk.sourceClass,
            language: chunk.language,
            originalText: chunk.originalText,
            normalizedText: chunk.normalizedText,
            chapterPath: json(chunk.chapterPath),
            volume: chunk.volume,
            printedPageStart: chunk.printedPageStart,
            printedPageEnd: chunk.printedPageEnd,
            pdfPageStart: chunk.pdfPageStart,
            pdfPageEnd: chunk.pdfPageEnd,
            ocrQuality: chunk.ocrQuality,
            searchable: chunk.searchable,
            trustClassification: chunk.trustClassification,
            verificationStatus: chunk.verificationStatus,
            rightsStatus: chunk.rightsStatus,
            isTestFixture: chunk.isTestFixture,
            url: chunk.url,
            fatwaNumber: chunk.fatwaNumber,
            title: chunk.title,
            author: chunk.author,
            editionLabel: chunk.editionLabel,
            opinionLabels: json(chunk.opinionLabels),
            comparativeAppliesTo: json(chunk.comparativeAppliesTo),
            translation: chunk.translation ? json(chunk.translation) : Prisma.JsonNull,
            embedding: chunk.embedding ? json(chunk.embedding) : Prisma.JsonNull,
            workId: chunk.workId,
            editionId: chunk.editionId,
          })),
        });
      }
    },
    async listDocuments() {
      return (await client.document.findMany({ where: { isTestFixture: false } })).map(asDocument);
    },
    async updateDocument(id, patch) {
      const current = asDocument(await client.document.findUniqueOrThrow({ where: { id } }));
      const next = { ...current, ...patch };
      await client.document.update({ where: { id }, data: documentData(next) });
      await client.chunk.updateMany({
        where: { documentId: id },
        data: {
          searchable: next.searchable,
          trustClassification: next.trustClassification,
          verificationStatus: next.verificationStatus,
          rightsStatus: next.rightsStatus,
          madhhab: next.madhhab,
        },
      });
      return next;
    },
    async getDocumentByHash(sha256) {
      const row = await client.document.findUnique({ where: { sha256 } });
      return row ? asDocument(row) : null;
    },
    async createJob(job) {
      await client.ingestionJob.create({ data: { id: job.id, documentId: job.documentId, status: job.status, step: job.step, error: job.error, attempts: job.attempts } });
    },
    async updateJob(id, patch) {
      const current = await getJob(id);
      const next = { ...current, ...patch };
      await client.ingestionJob.update({ where: { id }, data: { status: next.status, step: next.step, error: next.error, attempts: next.attempts, documentId: next.documentId } });
      if (patch.events) {
        await client.ingestionEvent.deleteMany({ where: { jobId: id } });
        if (patch.events.length) {
          await client.ingestionEvent.createMany({ data: patch.events.map((event) => ({ jobId: id, at: event.at, message: event.message, level: event.level })) });
        }
      }
      return next;
    },
    async listJobs() {
      const rows = await client.ingestionJob.findMany({ include: { events: true }, orderBy: { createdAt: "desc" } });
      return rows.map(asJob);
    },
    async saveExchange(row) {
      await client.conversation.create({
        data: {
          id: row.id,
          userId: row.userId,
          madhhab: row.madhhab,
          questions: {
            create: {
              id: row.id,
              userId: row.userId,
              originalText: row.question,
              textSha256: row.questionSha256,
              detectedLanguage: row.answer.detectedQueryLanguage,
              detectionUncertain: row.answer.detectionUncertain,
              answerLocale: row.answerLocale,
              madhhab: row.madhhab,
              answers: { create: { id: row.id, status: row.answer.answerStatus, payload: json(row.answer), provider: "recorded" } },
            },
          },
        },
      });
    },
    async getExchange(id) {
      const row = await client.question.findUnique({ where: { id }, include: { answers: true, conversation: true } });
      if (!row || !row.answers[0]) return null;
      const answer = row.answers[0].payload as PublicAnswer;
      return {
        id: row.id,
        userId: row.userId,
        question: row.originalText,
        questionSha256: row.textSha256,
        madhhab: row.madhhab,
        answerLocale: row.answerLocale,
        chunkIds: answer.sourceIds ?? [],
        answer,
        createdAt: row.createdAt.toISOString(),
      };
    },
    async createUser(user) {
      await client.user.create({ data: { id: user.id, email: user.email, passwordHash: user.passwordHash } });
    },
    async findUserByEmail(email) {
      const user = await client.user.findUnique({ where: { email } });
      return user ? { id: user.id, email: user.email, passwordHash: user.passwordHash, createdAt: user.createdAt.toISOString() } : null;
    },
    async deleteUser(id) {
      await client.user.delete({ where: { id } }).catch(() => undefined);
    },
    async upsertPreference(preference) {
      await client.preference.upsert({
        where: { userId: preference.userId },
        create: preference,
        update: { madhhab: preference.madhhab, answerLocale: preference.answerLocale },
      });
    },
    async getPreference(userId) {
      const row = await client.preference.findUnique({ where: { userId } });
      return row ? { userId, madhhab: row.madhhab, answerLocale: row.answerLocale } : null;
    },
    async addFeedback(row) {
      await client.feedback.create({ data: { id: row.id, answerId: row.answerId, userId: row.userId, kind: row.kind, note: row.note } });
    },
    async writeAudit(row) {
      await client.auditLog.create({
        data: {
          id: row.id,
          requestId: row.requestId,
          madhhab: row.madhhab,
          detectedLanguage: row.detectedLanguage,
          answerLanguage: row.answerLanguage,
          retrievalLanguages: row.retrievalLanguages,
          sourceIds: row.sourceIds,
          latencyMs: row.latencyMs,
          provider: row.provider,
          model: row.model,
          translationMethod: row.translationMethod,
          citationValidation: row.citationValidation,
          answerStatus: row.answerStatus,
          errorCode: row.errorCode,
          questionSha256: row.questionSha256,
        },
      });
    },
    async listAudits() {
      const rows = await client.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
      return rows.map((row) => ({ ...row, model: row.model, errorCode: row.errorCode, createdAt: row.createdAt.toISOString() })) as AuditRecord[];
    },
    async listInstitutions() {
      if (await client.institution.count() === 0) {
        await client.institution.createMany({ data: INSTITUTIONS.map((item) => ({ id: item.id, payload: json(item) })) });
      }
      const rows = await client.institution.findMany();
      return rows.map((row) => row.payload as Institution);
    },
    async updateInstitution(id, patch) {
      const items = await this.listInstitutions();
      const current = items.find((item) => item.id === id);
      if (!current) throw new Error("NOT_FOUND");
      const next = { ...current, ...patch };
      await client.institution.upsert({ where: { id }, create: { id, payload: json(next) }, update: { payload: json(next) } });
      return next;
    },
    async listAcquisitions() {
      if (await client.acquisitionRecord.count() === 0) {
        await client.acquisitionRecord.createMany({
          data: EXPECTED_WORKS.map((work) => ({
            id: work.id,
            status: statusForWork(work.id),
            payload: json({
              notes: work.notes,
              attempts: work.id === "quduri" ? QUDURI_CATALOGUE_CANDIDATES.map((item) => ({ query: "site:archive.org Mukhtasar al-Quduri", url: item.url, outcome: item.outcome, at: item.checked })) : [],
            }),
          })),
        });
      }
      const rows = await client.acquisitionRecord.findMany();
      return rows.map((row) => {
        const payload = row.payload as { notes?: string; attempts?: AcquisitionRecord["attempts"] };
        return { id: row.id, workId: row.workId ?? row.id, status: row.status, notes: payload.notes ?? "", attempts: payload.attempts ?? [] };
      });
    },
    async stats() {
      const [documents, chunks, jobs, acquisitions] = await Promise.all([
        client.document.count({ where: { isTestFixture: false } }),
        client.chunk.count({ where: { searchable: true, isTestFixture: false } }),
        client.ingestionJob.count({ where: { status: "failed" } }),
        client.acquisitionRecord.count({ where: { status: { not: "approved_for_ingestion" } } }),
      ]);
      return {
        approvedBooks: await client.document.count({ where: { searchable: true, sourceClass: "primary", isTestFixture: false } }),
        uploadedDocuments: documents,
        awaitingProcessing: await client.ingestionJob.count({ where: { status: { in: ["queued", "running"] } } }),
        indexedChunks: chunks,
        sourcesByMadhhab: {},
        sourcesByLanguage: {},
        awaitingRightsReview: await client.document.count({ where: { rightsStatus: "rights_review_required" } }),
        awaitingMetadataVerification: await client.document.count({ where: { verificationStatus: { not: "verified" } } }),
        failedJobs: jobs,
        missingRequiredBooks: acquisitions,
        sourcesDueForReverification: 0,
        recentAcquisition: [],
        libraryPopulated: chunks > 0,
      };
    },
  };

  async function getJob(id: string): Promise<JobRecord> {
    const row = await client.ingestionJob.findUniqueOrThrow({ where: { id }, include: { events: true } });
    return asJob(row);
  }

  function asJob(row: { id: string; documentId: string | null; status: string; step: string; error: string | null; attempts: number; events: { at: string; message: string; level: string }[] }): JobRecord {
    return {
      id: row.id,
      documentId: row.documentId,
      status: row.status as JobRecord["status"],
      step: row.step,
      error: row.error,
      attempts: row.attempts,
      events: row.events,
    };
  }
}

function documentData(document: StoredDocument): Prisma.DocumentUncheckedCreateInput {
  return {
    id: document.id,
    title: document.title,
    authorName: document.author,
    madhhab: document.madhhab,
    sourceClass: document.sourceClass,
    language: document.language,
    sha256: document.sha256,
    format: document.format,
    storagePath: document.storagePath,
    rightsStatus: document.rightsStatus,
    verificationStatus: document.verificationStatus,
    trustClassification: document.trustClassification,
    ocrStatus: document.ocrStatus,
    searchable: document.searchable,
    isTestFixture: document.isTestFixture,
    notes: document.notes,
    verificationNote: document.verificationNote,
    methodology: document.methodology,
    checkedOn: document.checkedOn,
    editionLabel: document.editionLabel,
    url: document.url,
    fatwaNumber: document.fatwaNumber,
    volume: document.volume,
  };
}

export async function prismaHealth(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  await db().$queryRaw`SELECT 1`;
  return true;
}

void (0 as unknown as UserRecord | PreferenceRecord | FeedbackRecord | ExchangeRecord);
