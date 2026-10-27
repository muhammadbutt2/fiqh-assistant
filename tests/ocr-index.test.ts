import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it } from "vitest";
import { ENGLISH_LINES, arabicPage, fakeEngine, makePdf, tempConfig, testDeps } from "./ocr-helpers";
import { SEARCHABLE_OCR_STATUSES, applyReview, processJob } from "@/server/ingest";
import {
  evaluateCalibration,
  importReference,
  readSamples,
  selectSamples,
  writeSamples,
  type CalibrationReport,
} from "@/server/ocr/calibration";
import type { OcrConfig } from "@/server/ocr/config";
import { derivePageState, indexBook, quarantineUnmeasuredOcr, type IndexDocumentMeta } from "@/server/ocr/index-pages";
import { evaluatePair } from "@/server/ocr/metrics";
import { listPageRecords, runPipeline, type RunReport } from "@/server/ocr/pipeline";
import { chunkAllowed } from "@/server/retrieve";
import { createMemoryStore, type Store, type StoredDocument } from "@/server/store";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

const BOOK_ID = "test-book";
const META: IndexDocumentMeta = {
  title: "TEST FIXTURE book",
  author: "Synthetic author",
  authorNote: "Synthetic test data.",
  language: "ar",
  madhhab: "hanafi",
  sourceClass: "primary",
  volume: null,
  workId: null,
  fileName: "test-book.pdf",
  filePath: "memory.pdf",
};
const APPROVAL = { note: "Test approval", reviewer: "Test Reviewer", checkedOn: "2026-01-01" };

const goodEdit = (text: string) => text.replace("المصنف", "المصنفا");
const slightlyBadEdit = (text: string) => text.replace("المصنف", `المصنف${"ف".repeat(9)}`);
const ruinedEdit = (text: string) => text.split(" ").map((token) => Array.from(token).reverse().join("")).join(" ");

type Prepared = {
  config: OcrConfig;
  dir: string;
  bytes: Uint8Array;
  report: RunReport;
  outputDir: string;
  numPages: number;
};

async function prepare(options: { numPages?: number; overrides?: Record<string, string>; confidence?: number } = {}): Promise<Prepared> {
  const numPages = options.numPages ?? 12;
  const { config, dir, cleanup } = await tempConfig(options.overrides);
  cleanups.push(cleanup);
  const bytes = await makePdf(Array.from({ length: numPages }, () => null));
  const engine = fakeEngine((page) => ({ text: arabicPage(page), meanConfidence: options.confidence ?? 90 }));
  const pages = Array.from({ length: numPages }, (_, index) => index + 1);
  const report = await runPipeline({
    book: { bookId: BOOK_ID, fileName: "test-book.pdf" },
    bytes,
    config,
    deps: testDeps(engine),
    options: { mode: "pilot", pages, dryRun: false, ocrLanguages: "ara", language: "ar", retryFailed: true, previewChars: 0 },
  });
  return { config, dir, bytes, report, outputDir: report.outputDir as string, numPages };
}

async function addReferences(prepared: Prepared, edits: Record<number, (text: string) => string>): Promise<void> {
  const records = await listPageRecords(prepared.outputDir);
  await writeSamples(prepared.outputDir, selectSamples(records, prepared.numPages, 8, prepared.config.thresholds), records, false);
  for (const [page, edit] of Object.entries(edits)) {
    const record = records.find((item) => item.pdfPage === Number(page));
    if (!record) throw new Error(`no OCR record for page ${page}`);
    await importReference({
      outputDir: prepared.outputDir,
      pdfPage: Number(page),
      referenceText: edit(record.text),
      reviewer: "Test Reviewer",
      edition: "Synthetic test edition",
      notes: "Synthetic reference written by the test suite.",
      confirmIdentical: false,
    });
  }
}

function evaluate(prepared: Prepared, thresholds = prepared.config.thresholds): Promise<CalibrationReport> {
  return evaluateCalibration({
    outputDir: prepared.outputDir,
    bookId: BOOK_ID,
    numPages: prepared.numPages,
    sourceSha256: prepared.report.sourceSha256,
    configHash: prepared.report.configHash,
    language: "ar",
    ocrLanguages: "ara",
    thresholds,
  });
}

function index(prepared: Prepared, store: Store, calibration: CalibrationReport, approval: typeof APPROVAL | null = APPROVAL, dryRun = false) {
  return indexBook({
    store,
    meta: META,
    sourceSha256: prepared.report.sourceSha256,
    configHash: prepared.report.configHash,
    numPages: prepared.numPages,
    outputDir: prepared.outputDir,
    config: prepared.config,
    calibration,
    approval,
    dryRun,
  });
}

const GOOD_PAGES = { 2: goodEdit, 3: goodEdit, 6: goodEdit, 7: goodEdit, 10: goodEdit, 11: goodEdit };

describe("accuracy gate", () => {
  it("is unmeasured without any human reference, and nothing becomes searchable even when approved", async () => {
    const prepared = await prepare();
    const calibration = await evaluate(prepared);
    expect(calibration.verdict.status).toBe("unmeasured");
    const store = createMemoryStore();
    const result = await index(prepared, store, calibration);
    expect(result.searchable).toBe(false);
    expect(result.candidateChunks).toBeGreaterThan(0);
    expect(result.ocrStatus).toBe("accuracy_unmeasured");
    expect(result.pageStates.accuracy_unmeasured).toBe(12);
    expect((await store.listChunks()).every((chunk) => !chunk.searchable && chunk.ocrQuality === "unmeasured")).toBe(true);
    expect((await store.listChunks()).some((chunk) => chunkAllowed(chunk, "hanafi", false))).toBe(false);
    expect(result.warnings.join(" ")).toContain("nothing was promoted");
  });

  it("needs enough reliable samples", async () => {
    const prepared = await prepare();
    await addReferences(prepared, { 2: goodEdit, 6: goodEdit });
    const calibration = await evaluate(prepared);
    expect(calibration.verdict.status).toBe("insufficient_samples");
    const store = createMemoryStore();
    const result = await index(prepared, store, calibration);
    expect(result.searchable).toBe(false);
    expect(result.candidateChunks).toBeGreaterThan(0);
    expect((await store.listChunks()).every((chunk) => !chunk.searchable)).toBe(true);
  });

  it("needs samples from the front, middle and back of the book", async () => {
    const prepared = await prepare({ numPages: 24 });
    await addReferences(prepared, { 1: goodEdit, 2: goodEdit, 3: goodEdit, 4: goodEdit, 5: goodEdit, 6: goodEdit, 7: goodEdit });
    const calibration = await evaluate(prepared);
    expect(calibration.verdict.status).toBe("insufficient_coverage");
    expect(calibration.coverage.missing).toEqual(expect.arrayContaining(["middle", "back"]));
    const coverage = await index(prepared, createMemoryStore(), calibration);
    expect(coverage.searchable).toBe(false);
    expect(coverage.candidateChunks).toBeGreaterThan(0);
  });

  it("fails when the measured error exceeds the thresholds, and approval cannot override it", async () => {
    const prepared = await prepare();
    await addReferences(prepared, { 2: ruinedEdit, 3: ruinedEdit, 6: ruinedEdit, 7: ruinedEdit, 10: ruinedEdit, 11: ruinedEdit });
    const calibration = await evaluate(prepared);
    expect(calibration.verdict.status).toBe("failed");
    expect(calibration.verdict.reasons.join(" ")).toContain("CER");
    const store = createMemoryStore();
    const result = await index(prepared, store, calibration);
    expect(result.searchable).toBe(false);
    expect(result.chunks).toBe(0);
    expect(result.candidateChunks).toBe(0);
    expect(result.ocrStatus).toBe("accuracy_failed");
    expect(result.pageStates.accuracy_failed).toBe(12);
  });

  it("passes with accurate references, reports strict and folded metrics separately", async () => {
    const prepared = await prepare();
    await addReferences(prepared, GOOD_PAGES);
    const calibration = await evaluate(prepared);
    expect(calibration.verdict.status).toBe("passed");
    expect(calibration.reliableSampleCount).toBe(6);
    expect(calibration.aggregate.strict?.mode).toBe("strict");
    expect(calibration.aggregate.folded?.mode).toBe("folded");
    expect(calibration.aggregate.strict?.cer).toBeGreaterThan(0);
    expect(calibration.aggregate.strict?.cer).toBeLessThan(prepared.config.thresholds.maxCer);
    expect(calibration.normalization).toContain("never modified");
  });

  it("verdicts are recomputed from the current thresholds, never cached", async () => {
    const prepared = await prepare();
    await addReferences(prepared, GOOD_PAGES);
    expect((await evaluate(prepared)).verdict.status).toBe("passed");
    const stricter = { ...prepared.config.thresholds, maxCer: 0.0001 };
    expect((await evaluate(prepared, stricter)).verdict.status).toBe("failed");
  });

  it("reports missing, identical, short, unattributed and stale references instead of counting them", async () => {
    const prepared = await prepare();
    const records = await listPageRecords(prepared.outputDir);
    await writeSamples(prepared.outputDir, [2, 3, 6, 7, 10, 11].map((pdfPage) => ({ pdfPage, strata: ["spread" as const], meanConfidence: 90, rotationDegrees: 0 })), records, false);
    const text = (page: number) => records.find((record) => record.pdfPage === page)?.text ?? "";

    const identical = await importReference({ outputDir: prepared.outputDir, pdfPage: 2, referenceText: text(2), reviewer: "R", edition: null, notes: "", confirmIdentical: false });
    expect(identical.warnings.join(" ")).toContain("identical");
    await importReference({ outputDir: prepared.outputDir, pdfPage: 3, referenceText: "قصير", reviewer: "R", edition: null, notes: "", confirmIdentical: false });
    await expect(importReference({ outputDir: prepared.outputDir, pdfPage: 6, referenceText: goodEdit(text(6)), reviewer: " ", edition: null, notes: "", confirmIdentical: false })).rejects.toThrow(/reviewer/);
    const referenceDir = path.join(prepared.outputDir, "calibration", "reference");
    await writeFile(path.join(referenceDir, "p00007.txt"), goodEdit(text(7)), "utf8");
    await importReference({ outputDir: prepared.outputDir, pdfPage: 10, referenceText: goodEdit(text(10)), reviewer: "R", edition: null, notes: "", confirmIdentical: false });
    await writeFile(path.join(referenceDir, "p00010.txt"), `${goodEdit(text(10))} edited later`, "utf8");

    const calibration = await evaluate(prepared);
    expect(calibration.verdict.status).toBe("unmeasured");
    expect(calibration.missingReferences).toEqual(expect.arrayContaining([6, 11]));
    const reasons = Object.fromEntries(calibration.excludedSamples.map((item) => [item.pdfPage, item.reasons.join(" | ")]));
    expect(reasons[2]).toContain("identical");
    expect(reasons[3]).toContain("fewer than");
    expect(reasons[7]).toContain("no reviewer metadata");
    expect(reasons[10]).toContain("changed after it was imported");
  });

  it("accepts an identical reference only when it was explicitly confirmed against the page image", async () => {
    const prepared = await prepare();
    const records = await listPageRecords(prepared.outputDir);
    const record = records.find((item) => item.pdfPage === 2);
    await importReference({ outputDir: prepared.outputDir, pdfPage: 2, referenceText: record?.text ?? "", reviewer: "R", edition: null, notes: "checked", confirmIdentical: true });
    const calibration = await evaluate(prepared);
    expect(calibration.samples.find((item) => item.pdfPage === 2)?.status).toBe("evaluated");
  });

  it("drops a reference when the OCR text for that page changes afterwards", async () => {
    const prepared = await prepare();
    await addReferences(prepared, { 2: goodEdit });
    const file = path.join(prepared.outputDir, "pages", "00002.json");
    const { readFile } = await import("fs/promises");
    const record = JSON.parse(await readFile(file, "utf8"));
    record.text = `${record.text} changed`;
    await writeFile(file, JSON.stringify(record), "utf8");
    const calibration = await evaluate(prepared);
    expect(calibration.samples.find((item) => item.pdfPage === 2)?.exclusionReasons.join(" ")).toContain("OCR text changed");
  });

  it("selects representative samples across the book", async () => {
    const prepared = await prepare();
    const records = await listPageRecords(prepared.outputDir);
    const samples = selectSamples(records, prepared.numPages, 8, prepared.config.thresholds);
    const strata = new Set(samples.flatMap((entry) => entry.strata));
    expect(strata.has("front") && strata.has("middle") && strata.has("back")).toBe(true);
    await writeSamples(prepared.outputDir, samples, records, true);
    expect((await readSamples(prepared.outputDir)).length).toBe(samples.length);
  });

  it("strict and folded metrics differ for diacritics and letter variants", () => {
    const reference = "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ";
    const hypothesis = "الحمد لله رب العالمين";
    expect(evaluatePair(reference, hypothesis, "strict").cer).toBeGreaterThan(0.2);
    expect(evaluatePair(reference, hypothesis, "folded").cer).toBe(0);
    const urdu = evaluatePair("نماز میں ٹھہرنا ضروری ہے", "نماز میں ٹھہرنا ضروری ہے", "strict");
    expect(urdu.cer).toBe(0);
    expect(evaluatePair("ہ ي ك", "ە ی ک", "strict").cer).toBeGreaterThan(0);
  });
});

describe("indexing and promotion", () => {
  it("promotes only passing pages and keeps a page that fails its own check out of the index", async () => {
    const prepared = await prepare({ overrides: { OCR_MAX_PAGE_CER: "0.01" } });
    await addReferences(prepared, { ...GOOD_PAGES, 5: slightlyBadEdit });
    const calibration = await evaluate(prepared);
    expect(calibration.verdict.status).toBe("passed");
    expect(calibration.failedPages).toEqual([5]);

    const store = createMemoryStore();
    const result = await index(prepared, store, calibration);
    expect(result.searchable).toBe(true);
    expect(result.ocrStatus).toBe("measured_partial");
    expect(result.indexedPages).not.toContain(5);
    expect(result.indexedPages).toHaveLength(11);
    expect(result.notPromoted).toEqual([{ pdfPage: 5, state: "accuracy_failed", reasons: expect.any(Array) }]);
    expect(result.pageStates.indexed).toBe(11);
    expect(result.pageStates.accuracy_failed).toBe(1);
    const chunks = await store.listChunks();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((chunk) => chunk.pdfPageStart === 5)).toBe(false);
    expect(chunks.every((chunk) => chunk.searchable && chunkAllowed(chunk, "hanafi", false))).toBe(true);
  });

  it("without owner approval, passing pages wait for review and stay unsearchable", async () => {
    const prepared = await prepare();
    await addReferences(prepared, GOOD_PAGES);
    const calibration = await evaluate(prepared);
    const store = createMemoryStore();
    const result = await index(prepared, store, calibration, null);
    expect(result.searchable).toBe(false);
    expect(result.pageStates.awaiting_review).toBe(12);
    expect((await store.listChunks()).every((chunk) => !chunk.searchable)).toBe(true);
  });

  it("a dry run writes nothing", async () => {
    const prepared = await prepare();
    await addReferences(prepared, GOOD_PAGES);
    const store = createMemoryStore();
    await index(prepared, store, await evaluate(prepared), APPROVAL, true);
    expect(await store.listDocuments()).toEqual([]);
    expect(await store.listChunks()).toEqual([]);
  });

  it("re-indexing is idempotent: same chunk ids, no duplicates", async () => {
    const prepared = await prepare();
    await addReferences(prepared, GOOD_PAGES);
    const calibration = await evaluate(prepared);
    const store = createMemoryStore();
    await index(prepared, store, calibration);
    const first = (await store.listChunks()).map((chunk) => chunk.id).sort();
    await index(prepared, store, calibration, null);
    const second = (await store.listChunks()).map((chunk) => chunk.id).sort();
    await index(prepared, store, calibration);
    const third = (await store.listChunks()).map((chunk) => chunk.id).sort();
    expect(new Set(first).size).toBe(first.length);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(await store.listDocuments()).toHaveLength(1);
  });

  it("carries page-level provenance and leaves printed pages empty without a verified page map", async () => {
    const prepared = await prepare();
    await addReferences(prepared, GOOD_PAGES);
    const store = createMemoryStore();
    await index(prepared, store, await evaluate(prepared));
    const chunk = (await store.listChunks()).find((item) => item.pdfPageStart === 4);
    expect(chunk).toBeDefined();
    expect(chunk?.pdfPageStart).toBe(4);
    expect(chunk?.printedPageStart).toBeNull();
    expect(chunk?.originalText).toContain("قال الإمام");
    expect(chunk?.normalizedText).not.toBe(chunk?.originalText);
    expect(chunk?.provenance).toMatchObject({
      bookId: BOOK_ID,
      sourceSha256: prepared.report.sourceSha256,
      extraction: "ocr",
      ocrEngine: "tesseract",
      ocrEngineVersion: "5.4.0-test",
      ocrModel: "ara",
      printedPageSource: "none",
      accuracy: { status: "passed", reliableSamples: 6 },
    });
    expect(chunk?.title).toBe(META.title);
    expect(chunk?.madhhab).toBe("hanafi");
    expect(chunk?.language).toBe("ar");
    expect(chunk?.rightsStatus).toBe("approved_for_ingestion");
  });

  it("uses printed page numbers only from a verified page map", async () => {
    const prepared = await prepare();
    await addReferences(prepared, GOOD_PAGES);
    await mkdir(path.join(prepared.dir, "page-maps"), { recursive: true });
    await writeFile(path.join(prepared.dir, "page-maps", `${BOOK_ID}.json`), JSON.stringify({ verifiedBy: "Test Reviewer", verifiedOn: "2026-01-01", pages: { "4": 12 } }), "utf8");
    const store = createMemoryStore();
    const result = await index(prepared, store, await evaluate(prepared));
    expect(result.printedPagesAttached).toBe(1);
    const chunks = await store.listChunks();
    expect(chunks.find((item) => item.pdfPageStart === 4)?.printedPageStart).toBe(12);
    expect(chunks.find((item) => item.pdfPageStart === 4)?.provenance?.printedPageSource).toBe("verified_page_map");
    expect(chunks.find((item) => item.pdfPageStart === 5)?.printedPageStart).toBeNull();
  });

  it("ignores an unverified page map and says so", async () => {
    const prepared = await prepare();
    await addReferences(prepared, GOOD_PAGES);
    await mkdir(path.join(prepared.dir, "page-maps"), { recursive: true });
    await writeFile(path.join(prepared.dir, "page-maps", `${BOOK_ID}.json`), JSON.stringify({ pages: { "4": 12 } }), "utf8");
    const store = createMemoryStore();
    const result = await index(prepared, store, await evaluate(prepared));
    expect(result.printedPagesAttached).toBe(0);
    expect(result.warnings.join(" ")).toContain("verifiedBy");
    expect((await store.listChunks()).every((chunk) => chunk.printedPageStart === null)).toBe(true);
  });

  it("quarantines OCR chunks that were stored without a measurement", async () => {
    const prepared = await prepare();
    await addReferences(prepared, GOOD_PAGES);
    const store = createMemoryStore();
    const result = await index(prepared, store, await evaluate(prepared));
    const quarantined = await quarantineUnmeasuredOcr(store, result.documentId, "third_party_ocr_unmeasured");
    expect(quarantined.chunks).toBeGreaterThan(0);
    const chunks = await store.listChunks();
    expect(chunks.every((chunk) => !chunk.searchable && chunk.ocrQuality === "unmeasured")).toBe(true);
    expect(chunks.some((chunk) => chunkAllowed({ ...chunk, searchable: true }, "hanafi", false))).toBe(false);
    expect((await store.listDocuments())[0]?.searchable).toBe(false);
  });
});

describe("retrieval and review gates", () => {
  it("applyReview only allows searchable status for text that needs no OCR or passed measurement", () => {
    const base: StoredDocument = {
      id: "d", title: "t", author: "a", madhhab: "hanafi", sourceClass: "primary", language: "ar", sha256: "h", format: "pdf", storagePath: "p",
      rightsStatus: "approved_for_ingestion", verificationStatus: "verified", trustClassification: "approved", ocrStatus: "not_needed", searchable: false,
      isTestFixture: false, notes: "", url: null, fatwaNumber: null, volume: null, editionLabel: null, workId: null,
      verificationNote: "checked", methodology: "m", checkedOn: "2026-01-01",
    };
    for (const status of ["pending", "needs_ocr", "ocr_pending", "accuracy_unmeasured", "accuracy_failed", "engine_present_unmeasured", "third_party_ocr_unmeasured", "unmeasured"]) {
      expect(applyReview(base, { ocrStatus: status }).searchable, status).toBe(false);
    }
    for (const status of SEARCHABLE_OCR_STATUSES) expect(applyReview(base, { ocrStatus: status }).searchable, status).toBe(true);
    expect(Array.from(SEARCHABLE_OCR_STATUSES).sort()).toEqual(["measured_acceptable", "measured_partial", "not_needed"]);
  });

  it("chunkAllowed rejects unmeasured OCR and OCR whose accuracy did not pass", async () => {
    const prepared = await prepare();
    await addReferences(prepared, GOOD_PAGES);
    const store = createMemoryStore();
    await index(prepared, store, await evaluate(prepared));
    const chunk = (await store.listChunks())[0];
    if (!chunk) throw new Error("expected chunks");
    expect(chunkAllowed(chunk, "hanafi", false)).toBe(true);
    expect(chunkAllowed({ ...chunk, ocrQuality: "unmeasured" }, "hanafi", false)).toBe(false);
    expect(chunkAllowed({ ...chunk, ocrQuality: "poor" }, "hanafi", false)).toBe(false);
    expect(chunkAllowed({ ...chunk, provenance: chunk.provenance && { ...chunk.provenance, accuracy: { ...chunk.provenance.accuracy, status: "unmeasured" } } }, "hanafi", false)).toBe(false);
    expect(chunkAllowed({ ...chunk, searchable: false }, "hanafi", false)).toBe(false);
    expect(chunkAllowed({ ...chunk, rightsStatus: "rights_review_required" }, "hanafi", false)).toBe(false);
    expect(chunkAllowed(chunk, "shafii", false)).toBe(false);
  });

  it("derives the documented page states", async () => {
    const prepared = await prepare();
    const [record] = await listPageRecords(prepared.outputDir);
    if (!record) throw new Error("expected a record");
    const context = { verdict: "unmeasured" as const, failedSamplePages: new Set<number>(), registeredPages: new Set<number>(), searchablePages: new Set<number>(), docApproved: false };
    expect(derivePageState(record, context).state).toBe("accuracy_unmeasured");
    expect(derivePageState(record, { ...context, verdict: "failed" }).state).toBe("accuracy_failed");
    expect(derivePageState(record, { ...context, verdict: "passed" }).state).toBe("awaiting_review");
    expect(derivePageState(record, { ...context, verdict: "passed", docApproved: true }).state).toBe("approved_for_indexing");
    expect(derivePageState(record, { ...context, verdict: "passed", docApproved: true, searchablePages: new Set([record.pdfPage]) }).state).toBe("indexed");
    expect(derivePageState(record, { ...context, verdict: "passed", failedSamplePages: new Set([record.pdfPage]) }).state).toBe("accuracy_failed");
    expect(derivePageState({ ...record, stage: "failed", error: { code: "OCR_FAILED", message: "x", hint: null } }, context).state).toBe("failed");
    expect(derivePageState({ ...record, stage: "ocr_pending", text: "" }, context).state).toBe("ocr_pending");
    const embedded = { ...record, method: "embedded_text" as const, stage: "text_extracted" as const, ocr: null };
    expect(derivePageState(embedded, context).state).toBe("text_extracted");
  });
});

describe("legacy ingestion job with a scanned PDF", () => {
  function doc(language: string): StoredDocument {
    return {
      id: "doc", title: "TEST FIXTURE", author: "Synthetic", madhhab: "hanafi", sourceClass: "primary", language, sha256: "hash-doc", format: "pdf", storagePath: "memory.pdf",
      rightsStatus: "rights_review_required", verificationStatus: "pending", trustClassification: "pending", ocrStatus: "pending", searchable: false, isTestFixture: false,
      notes: "", url: null, fatwaNumber: null, volume: null, editionLabel: null, workId: null, verificationNote: "", methodology: "", checkedOn: "",
    };
  }

  async function runJob(language: string, bytes: Uint8Array, ocrAvailable: boolean) {
    const store = createMemoryStore();
    await store.saveDocument(doc(language), []);
    await store.createJob({ id: "job", documentId: "doc", status: "queued", step: "queued", error: null, attempts: 0, events: [] });
    await processJob(store, "job", async () => bytes, { ocrAvailable });
    return { store, job: (await store.listJobs())[0], saved: (await store.listDocuments())[0], chunks: await store.listChunks() };
  }

  it("never indexes a scanned PDF through the legacy path, even when Tesseract is installed", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const result = await runJob("ar", await pdf.save(), true);
    expect(result.job?.error).toBe("OCR_PIPELINE_REQUIRED");
    expect(result.saved?.ocrStatus).toBe("ocr_pending");
    expect(result.saved?.searchable).toBe(false);
    expect(result.chunks).toEqual([]);
  });

  it("treats a hybrid PDF as needing OCR instead of indexing only its text pages", async () => {
    const result = await runJob("en", await makePdf([ENGLISH_LINES, null]), true);
    expect(result.job?.error).toBe("OCR_PIPELINE_REQUIRED");
    expect(result.chunks).toEqual([]);
  });

  it("extracts a clean text PDF but leaves it unsearchable until review", async () => {
    const result = await runJob("en", await makePdf([ENGLISH_LINES, ENGLISH_LINES]), true);
    expect(result.job?.status).toBe("completed");
    expect(result.saved?.ocrStatus).toBe("not_needed");
    expect(result.saved?.searchable).toBe(false);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.every((chunk) => !chunk.searchable && chunk.printedPageStart === null)).toBe(true);
  });
});
