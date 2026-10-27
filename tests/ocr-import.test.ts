import { mkdir } from "fs/promises";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { arabicPage, tempConfig } from "./ocr-helpers";
import {
  evaluateCalibration,
  importReference,
  selectSamples,
  writeSamples,
} from "@/server/ocr/calibration";
import { importedPageRecord, importPackagePages, parseOcrTextPackage } from "@/server/ocr/import-package";
import { derivePageState, indexBook, type IndexDocumentMeta } from "@/server/ocr/index-pages";
import { listPageRecords, writePageRecord, type PageRecord } from "@/server/ocr/pipeline";
import { chunkAllowed, chunkDiscoverable } from "@/server/retrieve";
import { createMemoryStore } from "@/server/store";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

const BOOK_SHA = "book-sha-test";
const CONFIG_HASH = "525dd464d9b6";
const META: IndexDocumentMeta = {
  title: "TEST FIXTURE Mukhtasar",
  author: "Synthetic author",
  authorNote: "Synthetic test data.",
  language: "ar",
  madhhab: "hanafi",
  sourceClass: "primary",
  volume: null,
  workId: "quduri",
  fileName: "al-qaduri.pdf",
  filePath: "memory.pdf",
};

const PACKAGE_TEXT = [
  "Al-Quduri — FULL-BOOK OCR DRAFT",
  "STATUS: UNVERIFIED MACHINE OCR.",
  "",
  "========== PDF PAGE 001 / 4 ==========",
  "ع",
  "",
  "========== PDF PAGE 002 / 4 ==========",
  arabicPage(2),
  "",
  "========== PDF PAGE 003 / 4 ==========",
  arabicPage(3),
  "",
  "========== PDF PAGE 004 / 4 ==========",
  arabicPage(4),
  "",
].join("\n");

function tesseractRecord(pdfPage: number, text: string): PageRecord {
  return {
    schemaVersion: 1,
    pdfPage,
    stage: "ocr_completed",
    method: "ocr",
    text,
    embedded: { verdict: "absent", reason: "scan", characters: 0, scriptRatio: 0, stopwordRate: null, replacementRatio: 0, symbolRatio: 0 },
    ocr: {
      engine: "tesseract",
      engineVersion: "5.4.0-test",
      languages: "ara",
      traineddata: { ara: "aaaa" },
      dpi: 300,
      renderScale: 4,
      widthPx: 100,
      heightPx: 100,
      psm: 3,
      meanConfidence: 88,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      rotationDegrees: 0,
      rotationNote: null,
      elapsedMs: 1,
      screen: { passed: true, reasons: [] },
    },
    error: null,
    sourceSha256: BOOK_SHA,
    configHash: CONFIG_HASH,
    processedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("imported OCR package parsing", () => {
  it("extracts PDF page indices, keeps original Arabic, and flags sparse pages as empty", () => {
    const parsed = parseOcrTextPackage(PACKAGE_TEXT);
    expect(parsed.declaredPages).toBe(4);
    expect(parsed.pages.map((page) => page.pdfPage)).toEqual([1, 2, 3, 4]);
    expect(parsed.missingPageNumbers).toEqual([]);
    expect(parsed.pages[0]?.empty).toBe(true);
    expect(parsed.pages[1]?.empty).toBe(false);
    expect(parsed.pages[1]?.originalText).toContain("قال الإمام");
    expect(parsed.header).toContain("UNVERIFIED MACHINE OCR");
  });

  it("reports missing page numbers instead of inventing them", () => {
    const parsed = parseOcrTextPackage("========== PDF PAGE 001 / 3 ==========\n" + arabicPage(1) + "\n========== PDF PAGE 003 / 3 ==========\n" + arabicPage(3) + "\n");
    expect(parsed.pages.map((page) => page.pdfPage)).toEqual([1, 3]);
    expect(parsed.missingPageNumbers).toEqual([2]);
  });

  it("does not assign printed page numbers to imported records", () => {
    const parsed = parseOcrTextPackage(PACKAGE_TEXT);
    const record = importedPageRecord({ page: parsed.pages[1] as (typeof parsed.pages)[number], sourceSha256: BOOK_SHA, configHash: CONFIG_HASH });
    expect(record.method).toBe("ocr");
    expect(record.ocr?.engine).toBe("imported_package");
    expect(record.ocr?.meanConfidence).toBeNull();
    expect(record.ocr?.rotationNote).toContain("Accuracy unmeasured");
    expect(record.ocr?.rotationNote).toContain("Printed pages not assigned");
  });
});

describe("imported OCR package ingest", () => {
  it("writes missing pages and skips existing Tesseract pilot pages", async () => {
    const { dir, cleanup } = await tempConfig();
    cleanups.push(cleanup);
    const outputDir = path.join(dir, "ocr", BOOK_SHA, CONFIG_HASH);
    await mkdir(path.join(outputDir, "pages"), { recursive: true });
    await writePageRecord(outputDir, tesseractRecord(2, arabicPage(2)));
    const parsed = parseOcrTextPackage(PACKAGE_TEXT);
    const result = await importPackagePages({ outputDir, bookSourceSha256: BOOK_SHA, parsed, recordConfigHash: CONFIG_HASH });
    expect(result.existingPilotPages).toEqual([2]);
    expect(result.duplicatePagesSkipped).toEqual([2]);
    expect(result.newlyImportedPages).toEqual([1, 3, 4]);
    expect(result.emptyPages).toEqual([1]);
    const records = await listPageRecords(outputDir);
    expect(records).toHaveLength(4);
    expect(records.find((item) => item.pdfPage === 2)?.ocr?.engine).toBe("tesseract");
    expect(records.find((item) => item.pdfPage === 2)?.text).toBe(arabicPage(2));
    expect(records.find((item) => item.pdfPage === 3)?.ocr?.engine).toBe("imported_package");
    expect(records.find((item) => item.pdfPage === 1)?.error?.code).toBe("IMPORTED_PAGE_EMPTY");
  });

  it("does not overwrite on a second import", async () => {
    const { dir, cleanup } = await tempConfig();
    cleanups.push(cleanup);
    const outputDir = path.join(dir, "ocr", BOOK_SHA, CONFIG_HASH);
    await mkdir(path.join(outputDir, "pages"), { recursive: true });
    const parsed = parseOcrTextPackage(PACKAGE_TEXT);
    await importPackagePages({ outputDir, bookSourceSha256: BOOK_SHA, parsed, recordConfigHash: CONFIG_HASH });
    const again = await importPackagePages({ outputDir, bookSourceSha256: BOOK_SHA, parsed, recordConfigHash: CONFIG_HASH });
    expect(again.newlyImportedPages).toEqual([]);
    expect(again.duplicatePagesSkipped).toEqual([1, 2, 3, 4]);
    expect(again.existingPilotPages).toEqual([]);
  });
});

describe("imported OCR stays outside the calibration and approval gates", () => {
  it("does not pick imported_package pages as calibration samples", async () => {
    const { dir, cleanup } = await tempConfig();
    cleanups.push(cleanup);
    const outputDir = path.join(dir, "ocr", BOOK_SHA, CONFIG_HASH);
    await mkdir(path.join(outputDir, "pages"), { recursive: true });
    for (const page of [1, 6, 12]) await writePageRecord(outputDir, tesseractRecord(page, arabicPage(page)));
    const parsed = parseOcrTextPackage(PACKAGE_TEXT);
    for (const page of parsed.pages.filter((item) => !item.empty)) {
      await writePageRecord(outputDir, importedPageRecord({ page, sourceSha256: BOOK_SHA, configHash: CONFIG_HASH }));
    }
    const records = await listPageRecords(outputDir);
    const samples = selectSamples(records, 12, 8, { maxCer: 0.05, maxWer: 0.15, maxCriticalErrorRate: 0.03, maxPageCer: 0.15, minCalibrationPages: 10, minReferenceChars: 150, minPageConfidence: 60, poorConfidence: 75, gateMetric: "strict", loosened: false });
    expect(samples.every((sample) => [1, 6, 12].includes(sample.pdfPage))).toBe(true);
    expect(samples.some((sample) => sample.pdfPage === 2 || sample.pdfPage === 3)).toBe(false);
  });

  it("refuses to import a human reference against imported-package OCR", async () => {
    const { dir, cleanup } = await tempConfig();
    cleanups.push(cleanup);
    const outputDir = path.join(dir, "ocr", BOOK_SHA, CONFIG_HASH);
    await mkdir(path.join(outputDir, "pages"), { recursive: true });
    const parsed = parseOcrTextPackage(PACKAGE_TEXT);
    await writePageRecord(outputDir, importedPageRecord({ page: parsed.pages[1] as (typeof parsed.pages)[number], sourceSha256: BOOK_SHA, configHash: CONFIG_HASH }));
    await expect(importReference({
      outputDir,
      pdfPage: 2,
      referenceText: arabicPage(2),
      reviewer: "Test Reviewer",
      edition: null,
      notes: "",
      confirmIdentical: false,
    })).rejects.toThrow(/imported-package OCR/);
  });

  it("keeps imported pages unmeasured even when Tesseract calibration has passed", async () => {
    const imported = importedPageRecord({
      page: { pdfPage: 3, originalText: arabicPage(3), usableCharacters: 200, empty: false },
      sourceSha256: BOOK_SHA,
      configHash: CONFIG_HASH,
    });
    const context = { verdict: "passed" as const, failedSamplePages: new Set<number>(), registeredPages: new Set<number>(), searchablePages: new Set<number>(), docApproved: true };
    expect(derivePageState(imported, context).state).toBe("accuracy_unmeasured");
    expect(derivePageState(tesseractRecord(3, arabicPage(3)), context).state).toBe("approved_for_indexing");
  });

  it("indexes imported text as labelled candidates that cannot support a ruling", async () => {
    const { config, dir, cleanup } = await tempConfig();
    cleanups.push(cleanup);
    const outputDir = path.join(dir, "ocr", BOOK_SHA, CONFIG_HASH);
    await mkdir(path.join(outputDir, "pages"), { recursive: true });
    await writePageRecord(outputDir, tesseractRecord(2, arabicPage(2)));
    const parsed = parseOcrTextPackage(PACKAGE_TEXT);
    await importPackagePages({ outputDir, bookSourceSha256: BOOK_SHA, parsed, recordConfigHash: CONFIG_HASH });
    const records = await listPageRecords(outputDir);
    await writeSamples(outputDir, [{ pdfPage: 2, strata: ["front"], meanConfidence: 88, rotationDegrees: 0 }], records, false);
    const calibration = await evaluateCalibration({
      outputDir,
      bookId: "al-qaduri",
      numPages: 4,
      sourceSha256: BOOK_SHA,
      configHash: CONFIG_HASH,
      language: "ar",
      ocrLanguages: "ara",
      thresholds: config.thresholds,
    });
    expect(calibration.verdict.status).toBe("unmeasured");
    expect(calibration.ocrEngine).toBe("tesseract");
    const store = createMemoryStore();
    const result = await indexBook({
      store,
      meta: META,
      sourceSha256: BOOK_SHA,
      configHash: CONFIG_HASH,
      numPages: 4,
      outputDir,
      config,
      calibration,
      approval: null,
      dryRun: false,
    });
    expect(result.searchable).toBe(false);
    expect(result.ocrStatus).toBe("accuracy_unmeasured");
    expect(result.candidateChunks).toBeGreaterThan(0);
    const document = (await store.listDocuments())[0];
    expect(document?.searchable).toBe(false);
    expect(document?.trustClassification).toBe("pending");
    expect(document?.rightsStatus).toBe("rights_review_required");
    const chunks = await store.listChunks();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => !chunk.searchable && chunk.ocrQuality === "unmeasured")).toBe(true);
    expect(chunks.every((chunk) => chunk.printedPageStart === null)).toBe(true);
    expect(chunks.some((chunk) => chunkAllowed(chunk, "hanafi", false))).toBe(false);
    expect(chunks.some((chunk) => chunkDiscoverable(chunk, "hanafi", false))).toBe(true);
    expect(chunks.filter((chunk) => chunk.provenance?.ocrEngine === "imported_package").every((chunk) => chunk.provenance?.accuracy.status === "unmeasured")).toBe(true);
    const tessChunk = chunks.find((chunk) => chunk.pdfPageStart === 2);
    expect(tessChunk?.provenance?.ocrEngine).toBe("tesseract");
  });

  it("does not promote imported pages when a Tesseract calibration stub has passed", async () => {
    const { config, dir, cleanup } = await tempConfig();
    cleanups.push(cleanup);
    const outputDir = path.join(dir, "ocr", BOOK_SHA, CONFIG_HASH);
    await mkdir(path.join(outputDir, "pages"), { recursive: true });
    await writePageRecord(outputDir, tesseractRecord(2, arabicPage(2)));
    const parsed = parseOcrTextPackage(PACKAGE_TEXT);
    await importPackagePages({ outputDir, bookSourceSha256: BOOK_SHA, parsed, recordConfigHash: CONFIG_HASH });
    const store = createMemoryStore();
    const result = await indexBook({
      store,
      meta: META,
      sourceSha256: BOOK_SHA,
      configHash: CONFIG_HASH,
      numPages: 4,
      outputDir,
      config,
      calibration: {
        schemaVersion: 1,
        bookId: "al-qaduri",
        sourceSha256: BOOK_SHA,
        configHash: CONFIG_HASH,
        language: "ar",
        ocrLanguages: "ara",
        ocrEngine: "tesseract",
        ocrEngineVersion: "5.4.0-test",
        traineddata: { ara: "aaaa" },
        edition: null,
        evaluatedAt: "2026-01-01T00:00:00.000Z",
        samples: [],
        aggregate: { strict: null, folded: null },
        reliableSampleCount: 10,
        missingReferences: [],
        excludedSamples: [],
        coverage: { required: ["front", "middle", "back"], covered: ["front", "middle", "back"], missing: [], notes: [] },
        verdict: { status: "passed", reasons: ["stub for promotion isolation"], gateMetric: "strict", thresholds: config.thresholds },
        failedPages: [],
        normalization: "",
      },
      approval: { note: "Test approval", reviewer: "Test Reviewer", checkedOn: "2026-01-01" },
      dryRun: false,
    });
    const chunks = await store.listChunks();
    const imported = chunks.filter((chunk) => chunk.provenance?.ocrEngine === "imported_package");
    const tesseract = chunks.filter((chunk) => chunk.provenance?.ocrEngine === "tesseract");
    expect(imported.length).toBeGreaterThan(0);
    expect(imported.every((chunk) => !chunk.searchable && chunk.ocrQuality === "unmeasured")).toBe(true);
    expect(imported.some((chunk) => chunkAllowed(chunk, "hanafi", false))).toBe(false);
    expect(tesseract.length).toBeGreaterThan(0);
    expect(tesseract.every((chunk) => chunk.searchable && chunkAllowed(chunk, "hanafi", false))).toBe(true);
    expect(result.candidateChunks).toBe(imported.length);
  });
});
