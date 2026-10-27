import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { chunkPages, applyReview, type ExtractedPage } from "@/server/ingest";
import type { CalibrationReport } from "@/server/ocr/calibration";
import type { OcrConfig } from "@/server/ocr/config";
import { listPageRecords, type PageRecord } from "@/server/ocr/pipeline";
import type { Store, StoredDocument } from "@/server/store";
import type { ChunkProvenance, StoredChunk } from "@/server/types";

export type DocPageState =
  | "uploaded"
  | "text_extracted"
  | "ocr_pending"
  | "ocr_completed"
  | "accuracy_unmeasured"
  | "accuracy_failed"
  | "awaiting_review"
  | "approved_for_indexing"
  | "indexed"
  | "failed";

export type PageStateContext = {
  verdict: CalibrationReport["verdict"]["status"] | null;
  failedSamplePages: ReadonlySet<number>;
  registeredPages: ReadonlySet<number>;
  searchablePages: ReadonlySet<number>;
  docApproved: boolean;
};

export function derivePageState(record: PageRecord, context: PageStateContext): { state: DocPageState; reasons: string[] } {
  if (record.stage === "failed") return { state: "failed", reasons: [record.error?.message ?? "processing failed"] };
  if (record.stage === "ocr_pending") return { state: "ocr_pending", reasons: [record.error?.message ?? "OCR has not run for this page"] };

  const passedGates = (): { ok: boolean; state?: DocPageState; reasons: string[] } => {
    if (record.method === "embedded_text") return { ok: true, reasons: [] };
    if (record.ocr?.engine === "imported_package") {
      return {
        ok: false,
        state: "accuracy_unmeasured",
        reasons: ["Imported package OCR is a different engine from this configuration's Tesseract run. Its accuracy has not been measured against human-checked references."],
      };
    }
    if (context.verdict === null || context.verdict === "unmeasured" || context.verdict === "insufficient_samples" || context.verdict === "insufficient_coverage") {
      return { ok: false, state: "accuracy_unmeasured", reasons: ["OCR accuracy for this book and configuration has not been measured against human-checked references."] };
    }
    if (context.verdict === "failed") return { ok: false, state: "accuracy_failed", reasons: ["The book-level calibration failed."] };
    if (context.failedSamplePages.has(record.pdfPage)) return { ok: false, state: "accuracy_failed", reasons: ["This page failed its own per-page CER check."] };
    if (record.ocr && !record.ocr.screen.passed) return { ok: false, state: "accuracy_failed", reasons: record.ocr.screen.reasons };
    return { ok: true, reasons: [] };
  };

  const gates = passedGates();
  if (!gates.ok) return { state: gates.state as DocPageState, reasons: gates.reasons };
  if (context.docApproved) return { state: context.searchablePages.has(record.pdfPage) ? "indexed" : "approved_for_indexing", reasons: [] };
  if (record.method === "embedded_text" && !context.registeredPages.has(record.pdfPage)) return { state: "text_extracted", reasons: ["Not yet registered for review."] };
  return { state: "awaiting_review", reasons: ["Measurement gates passed. Rights and metadata approval is still required."] };
}

export type PageMap = { verifiedBy: string; verifiedOn: string; edition?: string; pages: Record<string, number> };

export async function loadPageMap(dataRoot: string, bookId: string): Promise<{ map: PageMap | null; warning: string | null }> {
  const file = path.join(dataRoot, "page-maps", `${bookId}.json`);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return { map: null, warning: null };
  }
  try {
    const parsed = JSON.parse(raw) as PageMap;
    if (!parsed.verifiedBy?.trim() || !parsed.verifiedOn?.trim() || typeof parsed.pages !== "object") {
      return { map: null, warning: `${file} ignored: it needs verifiedBy, verifiedOn and a pages object. Printed page numbers stay empty.` };
    }
    return { map: parsed, warning: null };
  } catch {
    return { map: null, warning: `${file} ignored: it is not valid JSON. Printed page numbers stay empty.` };
  }
}

export type IndexDocumentMeta = {
  title: string;
  author: string;
  authorNote: string;
  language: string;
  madhhab: StoredDocument["madhhab"];
  sourceClass: StoredDocument["sourceClass"];
  volume: number | null;
  workId: string | null;
  fileName: string;
  filePath: string;
};

export type IndexResult = {
  documentId: string;
  ocrStatus: string;
  searchable: boolean;
  verdict: string;
  totalPages: number;
  pageStates: Record<DocPageState, number>;
  indexedPages: number[];
  chunks: number;
  candidateChunks: number;
  notPromoted: { pdfPage: number; state: DocPageState; reasons: string[] }[];
  printedPagesAttached: number;
  warnings: string[];
};

function emptyStates(): Record<DocPageState, number> {
  return { uploaded: 0, text_extracted: 0, ocr_pending: 0, ocr_completed: 0, accuracy_unmeasured: 0, accuracy_failed: 0, awaiting_review: 0, approved_for_indexing: 0, indexed: 0, failed: 0 };
}

function chunkId(sourceSha256: string, configHash: string, pdfPage: number, index: number): string {
  return `ck_${createHash("sha256").update(`${sourceSha256}:${configHash}:${pdfPage}:${index}`).digest("hex").slice(0, 32)}`;
}

function chunksFromRecords(input: {
  records: PageRecord[];
  document: StoredDocument;
  calibration: CalibrationReport;
  sourceSha256: string;
  configHash: string;
  printed: Record<string, number>;
  pageState: string;
  ocrQuality: StoredChunk["ocrQuality"];
  searchable: boolean;
  accuracyStatus: NonNullable<StoredChunk["provenance"]>["accuracy"]["status"];
}): { chunks: StoredChunk[]; printedAttached: number } {
  const group: PageRecord[][] = [];
  for (const record of input.records) {
    const last = group[group.length - 1];
    const previous = last?.[last.length - 1];
    const sameEngine = (previous?.ocr?.engine ?? previous?.method) === (record.ocr?.engine ?? record.method);
    if (previous && previous.pdfPage + 1 === record.pdfPage && sameEngine) last.push(record);
    else group.push([record]);
  }
  const chunks: StoredChunk[] = [];
  let printedAttached = 0;
  for (const run of group) {
    const pages: ExtractedPage[] = run.map((record) => {
      const printedPage = input.printed[String(record.pdfPage)] ?? null;
      if (printedPage !== null) printedAttached++;
      return { pdfPage: record.pdfPage, text: record.text, printedPage };
    });
    const built = chunkPages(pages, {
      documentId: input.document.id,
      workId: input.document.workId,
      editionId: null,
      madhhab: input.document.madhhab,
      comparativeAppliesTo: [],
      opinionLabels: [],
      sourceClass: input.document.sourceClass,
      language: input.document.language,
      volume: input.document.volume,
      ocrQuality: input.ocrQuality,
      rightsStatus: input.document.rightsStatus,
      verificationStatus: input.document.verificationStatus,
      trustClassification: input.document.trustClassification,
      searchable: input.searchable,
      url: input.document.url,
      fatwaNumber: input.document.fatwaNumber,
      title: input.document.title,
      author: input.document.author,
      editionLabel: input.document.editionLabel,
      isTestFixture: false,
      embedding: null,
      translation: null,
    });
    const perPage = new Map<number, number>();
    for (const chunk of built) {
      const record = run.find((item) => item.pdfPage === chunk.pdfPageStart) as PageRecord;
      const index = perPage.get(record.pdfPage) ?? 0;
      perPage.set(record.pdfPage, index + 1);
      const isOcr = record.method === "ocr";
      const provenance: ChunkProvenance = {
        bookId: input.calibration.bookId,
        sourceSha256: input.sourceSha256,
        configHash: record.configHash,
        extraction: isOcr ? "ocr" : "embedded_text",
        pageState: input.pageState,
        ocrEngine: record.ocr?.engine ?? null,
        ocrEngineVersion: record.ocr?.engineVersion ?? null,
        ocrModel: record.ocr ? record.ocr.languages : null,
        ocrTraineddata: record.ocr?.traineddata ?? null,
        ocrMeanConfidence: record.ocr?.meanConfidence ?? null,
        accuracy: isOcr
          ? { status: input.accuracyStatus, reliableSamples: input.calibration.reliableSampleCount, strictCer: input.calibration.aggregate.strict?.cer ?? null, strictWer: input.calibration.aggregate.strict?.wer ?? null, thresholdsLoosened: input.calibration.verdict.thresholds.loosened }
          : { status: "not_applicable", reliableSamples: null, strictCer: null, strictWer: null, thresholdsLoosened: false },
        printedPageSource: input.printed[String(record.pdfPage)] !== undefined ? "verified_page_map" : "none",
      };
      chunks.push({ ...chunk, id: chunkId(input.sourceSha256, record.configHash, record.pdfPage, index), ocrQuality: isOcr ? input.ocrQuality : "not_needed", provenance });
    }
  }
  return { chunks, printedAttached };
}

export async function indexBook(input: {
  store: Store;
  meta: IndexDocumentMeta;
  sourceSha256: string;
  configHash: string;
  numPages: number;
  outputDir: string;
  config: OcrConfig;
  calibration: CalibrationReport;
  approval: { note: string; reviewer: string; checkedOn: string } | null;
  dryRun: boolean;
}): Promise<IndexResult> {
  const { store, meta, calibration } = input;
  const warnings: string[] = [];
  const records = await listPageRecords(input.outputDir);
  const failedSamplePages = new Set(calibration.failedPages);
  const verdict = calibration.verdict.status;
  const pageMap = await loadPageMap(path.dirname(input.config.dataDir), calibration.bookId);
  if (pageMap.warning) warnings.push(pageMap.warning);

  const gateOnly = (record: PageRecord) => derivePageState(record, { verdict, failedSamplePages, registeredPages: new Set(), searchablePages: new Set(), docApproved: false });
  const eligible = records.filter((record) => {
    const state = gateOnly(record).state;
    return state === "awaiting_review" || state === "text_extracted";
  });
  const ocrRecords = records.filter((record) => record.method === "ocr");
  const eligibleOcr = eligible.filter((record) => record.method === "ocr");

  let ocrStatus: string;
  if (eligible.length === 0) {
    if (ocrRecords.length === 0) ocrStatus = records.some((record) => record.stage === "ocr_pending") || records.length === 0 ? "needs_ocr" : "ocr_pending";
    else ocrStatus = verdict === "failed" ? "accuracy_failed" : "accuracy_unmeasured";
  } else if (ocrRecords.length === 0 && eligible.length === input.numPages) ocrStatus = "not_needed";
  else if (eligible.length === input.numPages) ocrStatus = eligibleOcr.length === 0 ? "not_needed" : "measured_acceptable";
  else ocrStatus = "measured_partial";

  let document = await store.getDocumentByHash(input.sourceSha256);
  if (!document) {
    document = {
      id: randomUUID(),
      title: meta.title,
      author: meta.author,
      madhhab: meta.madhhab,
      sourceClass: meta.sourceClass,
      language: meta.language,
      sha256: input.sourceSha256,
      format: "pdf",
      storagePath: meta.filePath,
      rightsStatus: "rights_review_required",
      verificationStatus: "pending",
      trustClassification: "pending",
      ocrStatus,
      searchable: false,
      isTestFixture: false,
      notes: `Local file ${meta.fileName}. ${meta.authorNote} Kept outside git.`,
      url: null,
      fatwaNumber: null,
      volume: meta.volume,
      editionLabel: calibration.edition,
      workId: meta.workId,
      verificationNote: "",
      methodology: "",
      checkedOn: "",
    };
  }

  const patch: Partial<StoredDocument> = { ocrStatus, editionLabel: calibration.edition ?? document.editionLabel };
  if (input.approval) {
    if (eligible.length === 0) warnings.push("Approval was supplied but no page passed the measurement gates, so nothing was promoted.");
    patch.trustClassification = "approved";
    patch.rightsStatus = "approved_for_ingestion";
    patch.verificationNote = input.approval.note;
    patch.methodology = `Owner/reviewer approval by ${input.approval.reviewer}. OCR pages promoted only after the calibration verdict "${verdict}" (gate metric ${calibration.verdict.gateMetric}${calibration.verdict.thresholds.loosened ? ", thresholds loosened" : ""}).`;
    patch.checkedOn = input.approval.checkedOn;
  }
  const reviewPatch = applyReview(document, patch);
  const finalDocument: StoredDocument = { ...document, ...patch, ...reviewPatch, searchable: reviewPatch.searchable === true && eligible.length > 0 };
  const docApproved = finalDocument.trustClassification === "approved" && finalDocument.verificationStatus === "verified" && finalDocument.rightsStatus === "approved_for_ingestion";

  const printed = pageMap.map?.pages ?? {};
  const eligibleBuilt = chunksFromRecords({
    records: eligible,
    document: finalDocument,
    calibration,
    sourceSha256: input.sourceSha256,
    configHash: input.configHash,
    printed,
    pageState: finalDocument.searchable ? "indexed" : docApproved ? "approved_for_indexing" : "awaiting_review",
    ocrQuality: "acceptable",
    searchable: finalDocument.searchable,
    accuracyStatus: "passed",
  });
  const eligiblePages = new Set(eligible.map((record) => record.pdfPage));
  const candidateRecords = records.filter((record) => {
    if (eligiblePages.has(record.pdfPage)) return false;
    if (!record.text.trim()) return false;
    const state = gateOnly(record).state;
    return state === "accuracy_unmeasured" || state === "text_extracted";
  });
  const candidateBuilt = chunksFromRecords({
    records: candidateRecords,
    document: { ...finalDocument, searchable: false, trustClassification: "pending", verificationStatus: "pending" },
    calibration,
    sourceSha256: input.sourceSha256,
    configHash: input.configHash,
    printed,
    pageState: "accuracy_unmeasured",
    ocrQuality: "unmeasured",
    searchable: false,
    accuracyStatus: "unmeasured",
  });
  const chunks = [...eligibleBuilt.chunks, ...candidateBuilt.chunks];
  const printedAttached = eligibleBuilt.printedAttached + candidateBuilt.printedAttached;

  const existing = (await store.listChunks()).filter((chunk) => chunk.documentId === finalDocument.id && chunk.searchable);
  const searchablePages = new Set<number>((finalDocument.searchable ? chunks : existing).map((chunk) => chunk.pdfPageStart));
  const registeredPages = new Set<number>(chunks.map((chunk) => chunk.pdfPageStart));
  const states = emptyStates();
  const notPromoted: IndexResult["notPromoted"] = [];
  for (const record of records) {
    const { state, reasons } = derivePageState(record, { verdict, failedSamplePages, registeredPages, searchablePages, docApproved });
    states[state]++;
    if (state !== "indexed" && state !== "approved_for_indexing" && state !== "awaiting_review") notPromoted.push({ pdfPage: record.pdfPage, state, reasons });
  }
  states.uploaded += Math.max(0, input.numPages - records.length);

  if (!input.dryRun) await store.saveDocument(finalDocument, chunks);
  return {
    documentId: finalDocument.id,
    ocrStatus,
    searchable: finalDocument.searchable,
    verdict,
    totalPages: input.numPages,
    pageStates: states,
    indexedPages: finalDocument.searchable ? Array.from(searchablePages).sort((a, b) => a - b) : [],
    chunks: chunks.length,
    candidateChunks: candidateBuilt.chunks.length,
    notPromoted,
    printedPagesAttached: printedAttached,
    warnings,
  };
}

export async function quarantineUnmeasuredOcr(store: Store, documentId: string, ocrStatus: string): Promise<{ chunks: number }> {
  const document = (await store.listDocuments()).find((item) => item.id === documentId);
  if (!document) throw new Error("NOT_FOUND");
  const chunks = (await store.listChunks()).filter((chunk) => chunk.documentId === documentId).map((chunk) => ({ ...chunk, ocrQuality: "unmeasured" as const, searchable: false }));
  await store.saveDocument({ ...document, ocrStatus, searchable: false }, chunks);
  return { chunks: chunks.length };
}
