import { readdir } from "fs/promises";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ENGLISH_LINES, FAKE_INFO, arabicPage, fakeEngine, makePdf, tempConfig, testDeps } from "./ocr-helpers";
import { OcrError } from "@/server/ocr/errors";
import { listConfigDirs, listPageRecords, parsePageList, runPipeline, selectPilotPages, type RunOptions } from "@/server/ocr/pipeline";
import { openPdf } from "@/server/ocr/render";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

function options(overrides: Partial<RunOptions> = {}): RunOptions {
  return { mode: "pilot", pages: [1], dryRun: false, ocrLanguages: "ara", language: "ar", retryFailed: true, previewChars: 0, ...overrides };
}

async function setup(overrides: Record<string, string> = {}) {
  const temp = await tempConfig(overrides);
  cleanups.push(temp.cleanup);
  return temp;
}

const book = { bookId: "test-book", fileName: "test-book.pdf" };

describe("hybrid page extraction", () => {
  it("uses the embedded text layer and never calls OCR for a text PDF", async () => {
    const { config } = await setup();
    const bytes = await makePdf([ENGLISH_LINES, ENGLISH_LINES]);
    const engine = fakeEngine(() => ({ text: "should not be used" }));
    const report = await runPipeline({ book, bytes, config, deps: testDeps(engine), options: options({ pages: [1, 2], ocrLanguages: "eng", language: "en" }) });
    expect(report.counts.textExtracted).toBe(2);
    expect(report.counts.ocrCompleted).toBe(0);
    expect(engine.calls).toEqual([]);
    expect(report.pages.every((page) => page.method === "embedded_text")).toBe(true);
  });

  it("OCRs a scanned page, keeps the original PDF page index and records the engine", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null, null, null]);
    const engine = fakeEngine((page) => ({ text: arabicPage(page), meanConfidence: 88 }));
    const report = await runPipeline({ book, bytes, config, deps: testDeps(engine), options: options({ pages: [3] }) });
    expect(engine.calls).toEqual([3]);
    const page = report.pages[0];
    expect(page?.pdfPage).toBe(3);
    expect(page?.stage).toBe("ocr_completed");
    expect(page?.screenPassed).toBe(true);
    const [record] = await listPageRecords(report.outputDir as string);
    expect(record?.ocr?.engineVersion).toBe(FAKE_INFO.version);
    expect(record?.ocr?.traineddata).toEqual({ ara: "aaaa" });
    expect(record).not.toHaveProperty("printedPage");
  });

  it("handles a hybrid PDF: embedded text where usable, OCR only where needed", async () => {
    const { config } = await setup();
    const bytes = await makePdf([ENGLISH_LINES, null, ENGLISH_LINES, null]);
    const engine = fakeEngine(() => ({ text: ENGLISH_LINES.join("\n"), meanConfidence: 91 }));
    const report = await runPipeline({ book, bytes, config, deps: testDeps(engine), options: options({ pages: [1, 2, 3, 4], ocrLanguages: "eng", language: "en" }) });
    expect(report.pages.map((page) => page.method)).toEqual(["embedded_text", "ocr", "embedded_text", "ocr"]);
    expect(engine.calls.sort()).toEqual([2, 4]);
  });

  it("flags a low-confidence OCR page as failing the screen rather than hiding it", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null]);
    const engine = fakeEngine(() => ({ text: arabicPage(1), meanConfidence: 31 }));
    const report = await runPipeline({ book, bytes, config, deps: testDeps(engine), options: options() });
    expect(report.pages[0]?.screenPassed).toBe(false);
    expect(report.pages[0]?.screenReasons.join(" ")).toContain("below");
  });

  it("records a per-page OCR failure and carries on with the other pages", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null, null, null]);
    const engine = fakeEngine((page) => {
      if (page === 2) throw new OcrError("OCR_TIMEOUT", "timed out", "raise OCR_TIMEOUT_MS");
      return { text: arabicPage(page) };
    });
    const report = await runPipeline({ book, bytes, config, deps: testDeps(engine), options: options({ pages: [1, 2, 3] }) });
    expect(report.pages.map((page) => page.stage)).toEqual(["ocr_completed", "failed", "ocr_completed"]);
    expect(report.pages[1]?.error?.code).toBe("OCR_TIMEOUT");
    expect(report.counts.failed).toBe(1);
  });

  it("marks pages ocr_pending, with an actionable error, when Tesseract is missing", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null, ENGLISH_LINES]);
    const missing = testDeps(async () => {
      throw new OcrError("OCR_ENGINE_UNAVAILABLE", "Tesseract was not found.", "winget install -e --id UB-Mannheim.TesseractOCR");
    });
    const report = await runPipeline({ book, bytes, config, deps: missing, options: options({ pages: [1, 2], ocrLanguages: "eng", language: "en" }) });
    expect(report.engineError?.code).toBe("OCR_ENGINE_UNAVAILABLE");
    expect(report.pages[0]?.stage).toBe("ocr_pending");
    expect(report.pages[1]?.stage).toBe("text_extracted");
    expect(report.counts.ocrPending).toBe(1);
    expect(report.notes.join(" ")).toContain("OCR did not run");
  });

  it("reports missing language data instead of running with the wrong language", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null]);
    const engine = fakeEngine(() => ({ text: "x" }), { ...FAKE_INFO, installedLanguages: ["eng"], traineddata: { eng: "e" } });
    const report = await runPipeline({ book, bytes, config, deps: testDeps(engine), options: options({ ocrLanguages: "urd+ara" }) });
    expect(report.engineError?.code).toBe("OCR_LANGUAGE_DATA_MISSING");
    expect(report.pages[0]?.stage).toBe("ocr_pending");
    expect(engine.calls).toEqual([]);
  });

  it("rejects a corrupt PDF with PDF_CORRUPT", async () => {
    await expect(openPdf(new TextEncoder().encode("this is not a pdf"))).rejects.toMatchObject({ code: "PDF_CORRUPT" });
  });

  it("rejects page numbers outside the document", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null]);
    await expect(runPipeline({ book, bytes, config, deps: testDeps(fakeEngine(() => ({}))), options: options({ pages: [9] }) })).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });
});

describe("dry run, resume and checkpoints", () => {
  it("dry run writes nothing and never starts the engine", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null, ENGLISH_LINES]);
    let engineStarted = false;
    const deps = testDeps(async () => {
      engineStarted = true;
      return fakeEngine(() => ({}));
    });
    const report = await runPipeline({ book, bytes, config, deps, options: options({ pages: [1, 2], dryRun: true, ocrLanguages: "eng", language: "en" }) });
    expect(engineStarted).toBe(false);
    expect(report.counts.wouldOcr).toBe(1);
    expect(report.outputDir).toBeNull();
    await expect(readdir(config.dataDir)).rejects.toThrow();
  });

  it("resumes from checkpoints: completed pages are not re-OCRed", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null, null, null, null]);
    const first = fakeEngine((page) => ({ text: arabicPage(page) }));
    await runPipeline({ book, bytes, config, deps: testDeps(first), options: options({ pages: [1, 2] }) });
    expect(first.calls.sort()).toEqual([1, 2]);

    const second = fakeEngine((page) => ({ text: arabicPage(page) }));
    const report = await runPipeline({ book, bytes, config, deps: testDeps(second), options: options({ pages: [1, 2, 3, 4] }) });
    expect(second.calls.sort()).toEqual([3, 4]);
    expect(report.counts.resumedFromCheckpoint).toBe(2);
    expect(await listPageRecords(report.outputDir as string)).toHaveLength(4);
  });

  it("resumes after an interrupted run and keeps already-written pages", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null, null, null, null, null]);
    const controller = new AbortController();
    const engine = fakeEngine((page) => {
      if (page === 2) controller.abort();
      return { text: arabicPage(page) };
    });
    const interrupted = await runPipeline({ book, bytes, config, deps: testDeps(engine), options: options({ pages: [1, 2, 3, 4, 5], signal: controller.signal }) });
    expect(interrupted.interrupted).toBe(true);
    const written = await listPageRecords(interrupted.outputDir as string);
    expect(written.length).toBeGreaterThanOrEqual(2);
    expect(written.length).toBeLessThan(5);

    const resumed = fakeEngine((page) => ({ text: arabicPage(page) }));
    const final = await runPipeline({ book, bytes, config, deps: testDeps(resumed), options: options({ pages: [1, 2, 3, 4, 5] }) });
    expect(final.interrupted).toBe(false);
    expect(final.counts.ocrCompleted).toBe(5);
    expect(resumed.calls.length).toBe(5 - written.length);
  });

  it("retries failed pages on resume by default, and keeps them failed with retryFailed=false", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null]);
    const failing = fakeEngine(() => {
      throw new OcrError("OCR_FAILED", "boom", null);
    });
    await runPipeline({ book, bytes, config, deps: testDeps(failing), options: options() });

    const skip = fakeEngine(() => ({ text: arabicPage(1) }));
    const skipped = await runPipeline({ book, bytes, config, deps: testDeps(skip), options: options({ retryFailed: false }) });
    expect(skip.calls).toEqual([]);
    expect(skipped.pages[0]?.stage).toBe("failed");

    const retry = fakeEngine(() => ({ text: arabicPage(1) }));
    const retried = await runPipeline({ book, bytes, config, deps: testDeps(retry), options: options() });
    expect(retry.calls).toEqual([1]);
    expect(retried.pages[0]?.stage).toBe("ocr_completed");
  });

  it("a changed OCR configuration gets its own folder and is reprocessed", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null]);
    const a = fakeEngine(() => ({ text: arabicPage(1) }));
    const first = await runPipeline({ book, bytes, config, deps: testDeps(a), options: options() });
    const b = fakeEngine(() => ({ text: arabicPage(1) }), { ...FAKE_INFO, installedLanguages: ["ara", "urd"], traineddata: { ara: "aaaa", urd: "uuuu" } });
    const second = await runPipeline({ book, bytes, config, deps: testDeps(b), options: options({ ocrLanguages: "urd+ara" }) });
    expect(second.configHash).not.toBe(first.configHash);
    expect(b.calls).toEqual([1]);
    expect((await listConfigDirs(config, first.sourceSha256)).length).toBe(2);
  });

  it("a new engine or traineddata version also reprocesses pages", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null]);
    const first = await runPipeline({ book, bytes, config, deps: testDeps(fakeEngine(() => ({ text: arabicPage(1) }))), options: options() });
    const upgraded = fakeEngine(() => ({ text: arabicPage(1) }), { ...FAKE_INFO, version: "5.5.0-test" });
    const second = await runPipeline({ book, bytes, config, deps: testDeps(upgraded), options: options() });
    expect(second.configHash).not.toBe(first.configHash);
    expect(upgraded.calls).toEqual([1]);
  });

  it("a different file with different bytes never reuses another file's pages", async () => {
    const { config } = await setup();
    const one = await makePdf([null]);
    const two = await makePdf([null, null]);
    const a = await runPipeline({ book, bytes: one, config, deps: testDeps(fakeEngine(() => ({ text: arabicPage(1) }))), options: options() });
    const engine = fakeEngine(() => ({ text: arabicPage(1) }));
    const b = await runPipeline({ book, bytes: two, config, deps: testDeps(engine), options: options() });
    expect(a.sourceSha256).not.toBe(b.sourceSha256);
    expect(engine.calls).toEqual([1]);
  });

  it("respects concurrency and bounded batches without losing pages", async () => {
    const { config } = await setup({ OCR_CONCURRENCY: "3", OCR_BATCH_SIZE: "4" });
    const bytes = await makePdf(Array.from({ length: 9 }, () => null));
    let active = 0;
    let peak = 0;
    const engine = fakeEngine(async (page) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { text: arabicPage(page) };
    });
    const pages = Array.from({ length: 9 }, (_, index) => index + 1);
    const report = await runPipeline({ book, bytes, config, deps: testDeps(engine), options: options({ pages }) });
    expect(report.counts.ocrCompleted).toBe(9);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("reports progress with a remaining count", async () => {
    const { config } = await setup();
    const bytes = await makePdf([null, null]);
    const seen: number[] = [];
    await runPipeline({ book, bytes, config, deps: testDeps(fakeEngine((page) => ({ text: arabicPage(page) }))), options: options({ pages: [1, 2], onProgress: (progress) => seen.push(progress.remaining) }) });
    expect(seen).toEqual([1, 0]);
  });

  it("writes only inside the configured data directory", async () => {
    const { config, dir } = await setup();
    const bytes = await makePdf([null]);
    const report = await runPipeline({ book, bytes, config, deps: testDeps(fakeEngine(() => ({ text: arabicPage(1) }))), options: options() });
    expect(path.relative(dir, report.outputDir as string).startsWith("..")).toBe(false);
  });
});

describe("page selection", () => {
  it("spreads pilot pages across the book and honours explicit lists", () => {
    expect(selectPilotPages(100, 4)).toEqual([13, 38, 63, 88]);
    expect(selectPilotPages(3, 10)).toHaveLength(3);
    expect(selectPilotPages(50, 5, [9, 3, 3, 99])).toEqual([3, 9]);
  });

  it("parses page lists and rejects bad input", () => {
    expect(parsePageList("5,10-12", 20)).toEqual([5, 10, 11, 12]);
    expect(() => parsePageList("12-10", 20)).toThrow(/backwards/);
    expect(() => parsePageList("abc", 20)).toThrow(/not a number/);
    expect(() => parsePageList("1-30", 20)).toThrow(/outside/);
  });
});
