import { createHash } from "crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "fs/promises";
import path from "path";
import { ASSESS_VERSION, assessText, scriptForLanguage, type Assessment } from "@/server/ocr/assess";
import type { OcrConfig } from "@/server/ocr/config";
import { OcrError, describeError } from "@/server/ocr/errors";
import type { PdfHandle } from "@/server/ocr/render";
import { rotatePng } from "@/server/ocr/render";
import { requireLanguages, type OcrEngine } from "@/server/ocr/tesseract";

export const PAGE_SCHEMA_VERSION = 1;

export type PageStage = "text_extracted" | "ocr_pending" | "ocr_completed" | "failed";

export type PageRecord = {
  schemaVersion: number;
  pdfPage: number;
  stage: PageStage;
  method: "embedded_text" | "ocr" | null;
  text: string;
  embedded: Assessment | null;
  ocr: null | {
    engine: "tesseract";
    engineVersion: string;
    languages: string;
    traineddata: Record<string, string>;
    dpi: number;
    renderScale: number;
    widthPx: number;
    heightPx: number;
    psm: number;
    meanConfidence: number | null;
    wordCount: number;
    rotationDegrees: number;
    rotationNote: string | null;
    elapsedMs: number;
    screen: { passed: boolean; reasons: string[] };
  };
  error: null | { code: string; message: string; hint: string | null };
  sourceSha256: string;
  configHash: string;
  processedAt: string;
};

export type PipelineDeps = {
  openPdf: (bytes: Uint8Array) => Promise<PdfHandle>;
  engine: () => Promise<OcrEngine>;
  now?: () => Date;
};

export type RunOptions = {
  mode: "pilot" | "full";
  pages: number[];
  dryRun: boolean;
  ocrLanguages: string;
  language: "ar" | "ur" | "en";
  retryFailed: boolean;
  previewChars: number;
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
};

export type Progress = { total: number; done: number; remaining: number; failed: number; elapsedMs: number; etaMs: number | null; message: string };

export type PageSummary = {
  pdfPage: number;
  stage: PageStage;
  method: PageRecord["method"];
  characters: number;
  embeddedVerdict: string | null;
  embeddedReason: string | null;
  meanConfidence: number | null;
  screenPassed: boolean | null;
  screenReasons: string[];
  rotationDegrees: number;
  elapsedMs: number | null;
  skippedBecauseCheckpointed: boolean;
  error: PageRecord["error"];
  preview: string | null;
};

export type RunReport = {
  schemaVersion: number;
  bookId: string;
  fileName: string;
  sourceSha256: string;
  numPages: number;
  mode: RunOptions["mode"];
  dryRun: boolean;
  configHash: string;
  ocrLanguages: string;
  requestedPages: number[];
  counts: { textExtracted: number; ocrCompleted: number; ocrPending: number; failed: number; resumedFromCheckpoint: number; wouldOcr: number };
  engine: null | { command: string; version: string; tessdataDir: string | null; installedLanguages: string[] };
  engineError: null | { code: string; message: string; hint: string | null };
  startedAt: string;
  elapsedMs: number;
  interrupted: boolean;
  pages: PageSummary[];
  notes: string[];
  outputDir: string | null;
};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function configFingerprint(input: { ocrLanguages: string; language: string; config: OcrConfig; engineVersion: string; traineddata: Record<string, string> }): string {
  const material = JSON.stringify({
    page: PAGE_SCHEMA_VERSION,
    assess: ASSESS_VERSION,
    languages: input.ocrLanguages,
    language: input.language,
    dpi: input.config.dpi,
    maxPixels: input.config.maxRenderPixels,
    psm: input.config.psm,
    rotation: input.config.detectRotation,
    minConfidence: input.config.thresholds.minPageConfidence,
    engine: input.engineVersion,
    traineddata: Object.fromEntries(Object.entries(input.traineddata).sort(([a], [b]) => a.localeCompare(b))),
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 12);
}

export function bookOutputDir(config: OcrConfig, sourceSha256: string, configHash: string): string {
  return path.join(config.dataDir, sourceSha256, configHash);
}

export function pageFile(dir: string, pdfPage: number): string {
  return path.join(dir, "pages", `${String(pdfPage).padStart(5, "0")}.json`);
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value), "utf8");
  await rename(temp, file);
}

export async function readPageRecord(dir: string, pdfPage: number): Promise<PageRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(pageFile(dir, pdfPage), "utf8")) as PageRecord;
    return parsed.schemaVersion === PAGE_SCHEMA_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export async function listPageRecords(dir: string): Promise<PageRecord[]> {
  let names: string[] = [];
  try {
    names = (await readdir(path.join(dir, "pages"))).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const records: PageRecord[] = [];
  for (const name of names) {
    try {
      const parsed = JSON.parse(await readFile(path.join(dir, "pages", name), "utf8")) as PageRecord;
      if (parsed.schemaVersion === PAGE_SCHEMA_VERSION) records.push(parsed);
    } catch {
      // A half-written or corrupt page file is treated as missing so a resume reprocesses it.
    }
  }
  return records.sort((a, b) => a.pdfPage - b.pdfPage);
}

export type ConfigDir = { configHash: string; dir: string; updatedAt: string; ocrLanguages: string; numPages: number };

export async function listConfigDirs(config: OcrConfig, sourceSha256: string): Promise<ConfigDir[]> {
  const root = path.join(config.dataDir, sourceSha256);
  let names: string[] = [];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }
  const found: ConfigDir[] = [];
  for (const name of names) {
    try {
      const manifest = JSON.parse(await readFile(path.join(root, name, "manifest.json"), "utf8")) as { updatedAt: string; ocrLanguages: string; numPages: number };
      found.push({ configHash: name, dir: path.join(root, name), updatedAt: manifest.updatedAt, ocrLanguages: manifest.ocrLanguages, numPages: manifest.numPages });
    } catch {
      // Not a configuration folder.
    }
  }
  return found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function selectPilotPages(numPages: number, limit: number, explicit?: number[]): number[] {
  if (explicit && explicit.length > 0) {
    return Array.from(new Set(explicit)).filter((page) => page >= 1 && page <= numPages).sort((a, b) => a - b);
  }
  const count = Math.max(1, Math.min(limit, numPages));
  const picked = new Set<number>();
  for (let index = 0; index < count; index++) {
    picked.add(Math.min(numPages, Math.max(1, Math.floor(((index + 0.5) / count) * numPages) + 1)));
  }
  return Array.from(picked).sort((a, b) => a - b);
}

export function parsePageList(spec: string, numPages: number): number[] {
  const pages = new Set<number>();
  for (const part of spec.split(",").map((item) => item.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to < from) throw new OcrError("CONFIG_INVALID", `Page range ${part} is backwards.`);
      for (let page = from; page <= to; page++) pages.add(page);
    } else if (/^\d+$/.test(part)) pages.add(Number(part));
    else throw new OcrError("CONFIG_INVALID", `Page list item ${JSON.stringify(part)} is not a number or range.`);
  }
  const bad = Array.from(pages).filter((page) => page < 1 || page > numPages);
  if (bad.length > 0) throw new OcrError("CONFIG_INVALID", `Pages outside 1-${numPages}: ${bad.join(", ")}.`);
  return Array.from(pages).sort((a, b) => a - b);
}

class Mutex {
  private tail: Promise<void> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

export async function runPipeline(input: {
  book: { bookId: string; fileName: string };
  bytes: Uint8Array;
  config: OcrConfig;
  deps: PipelineDeps;
  options: RunOptions;
}): Promise<RunReport> {
  const { book, bytes, config, deps, options } = input;
  const now = deps.now ?? (() => new Date());
  const started = Date.now();
  const sourceSha256 = sha256Hex(bytes);
  const pdf = await deps.openPdf(bytes);
  const notes: string[] = [];
  try {
    const bad = options.pages.filter((page) => page < 1 || page > pdf.numPages);
    if (bad.length > 0) throw new OcrError("CONFIG_INVALID", `Pages outside 1-${pdf.numPages}: ${bad.join(", ")}.`);

    let enginePromise: Promise<OcrEngine> | null = null;
    const state: { engineError: RunReport["engineError"]; engineInfo: RunReport["engine"] } = { engineError: null, engineInfo: null };
    const getEngine = async (): Promise<OcrEngine | null> => {
      if (state.engineError) return null;
      if (!enginePromise) {
        enginePromise = (async () => {
          const engine = await deps.engine();
          requireLanguages(engine.info, options.ocrLanguages);
          return engine;
        })();
      }
      try {
        const engine = await enginePromise;
        state.engineInfo = { command: engine.info.command, version: engine.info.version, tessdataDir: engine.info.tessdataDir, installedLanguages: engine.info.installedLanguages };
        return engine;
      } catch (error) {
        state.engineError = describeError(error);
        return null;
      }
    };

    let engineVersion = "unavailable";
    let traineddata: Record<string, string> = {};
    if (!options.dryRun) {
      const engine = await getEngine();
      if (engine) {
        engineVersion = engine.info.version;
        traineddata = Object.fromEntries(options.ocrLanguages.split("+").map((lang) => [lang, engine.info.traineddata[lang] ?? "unknown"]));
      }
    }
    const configHash = configFingerprint({ ocrLanguages: options.ocrLanguages, language: options.language, config, engineVersion, traineddata });
    const outputDir = options.dryRun ? null : bookOutputDir(config, sourceSha256, configHash);
    const expected = scriptForLanguage(options.language);
    const renderMutex = new Mutex();
    const summaries = new Map<number, PageSummary>();
    const counts = { textExtracted: 0, ocrCompleted: 0, ocrPending: 0, failed: 0, resumedFromCheckpoint: 0, wouldOcr: 0 };
    let interrupted = false;

    if (outputDir) {
      await writeJsonAtomic(path.join(outputDir, "manifest.json"), {
        schemaVersion: PAGE_SCHEMA_VERSION,
        bookId: book.bookId,
        fileName: book.fileName,
        sourceSha256,
        numPages: pdf.numPages,
        configHash,
        ocrLanguages: options.ocrLanguages,
        language: options.language,
        engine: state.engineInfo,
        settings: { dpi: config.dpi, maxRenderPixels: config.maxRenderPixels, psm: config.psm, detectRotation: config.detectRotation },
        updatedAt: now().toISOString(),
      });
    }

    const summarize = (record: PageRecord, skipped: boolean): PageSummary => ({
      pdfPage: record.pdfPage,
      stage: record.stage,
      method: record.method,
      characters: Array.from(record.text.replace(/\s+/g, "")).length,
      embeddedVerdict: record.embedded?.verdict ?? null,
      embeddedReason: record.embedded?.reason ?? null,
      meanConfidence: record.ocr?.meanConfidence ?? null,
      screenPassed: record.ocr?.screen.passed ?? null,
      screenReasons: record.ocr?.screen.reasons ?? [],
      rotationDegrees: record.ocr?.rotationDegrees ?? 0,
      elapsedMs: record.ocr?.elapsedMs ?? null,
      skippedBecauseCheckpointed: skipped,
      error: record.error,
      preview: options.previewChars > 0 ? record.text.slice(0, options.previewChars) : null,
    });

    const tally = (record: PageRecord, skipped: boolean) => {
      if (skipped) counts.resumedFromCheckpoint++;
      if (record.stage === "text_extracted") counts.textExtracted++;
      else if (record.stage === "ocr_completed") counts.ocrCompleted++;
      else if (record.stage === "ocr_pending") counts.ocrPending++;
      else counts.failed++;
    };

    const baseRecord = (pdfPage: number): PageRecord => ({
      schemaVersion: PAGE_SCHEMA_VERSION,
      pdfPage,
      stage: "ocr_pending",
      method: null,
      text: "",
      embedded: null,
      ocr: null,
      error: null,
      sourceSha256,
      configHash,
      processedAt: now().toISOString(),
    });

    const processPage = async (pdfPage: number): Promise<void> => {
      if (options.signal?.aborted) {
        interrupted = true;
        return;
      }
      if (outputDir) {
        const existing = await readPageRecord(outputDir, pdfPage);
        const reusable = existing
          && existing.sourceSha256 === sourceSha256
          && existing.configHash === configHash
          && (existing.stage === "text_extracted" || existing.stage === "ocr_completed" || (existing.stage === "failed" && !options.retryFailed));
        if (existing && reusable) {
          tally(existing, true);
          summaries.set(pdfPage, summarize(existing, true));
          return;
        }
      }
      const record = baseRecord(pdfPage);
      try {
        const embeddedText = await pdf.getText(pdfPage);
        const assessment = assessText(embeddedText, expected);
        record.embedded = assessment;
        if (assessment.verdict === "usable") {
          record.stage = "text_extracted";
          record.method = "embedded_text";
          record.text = embeddedText;
        } else if (options.dryRun) {
          counts.wouldOcr++;
        } else {
          const engine = await getEngine();
          if (!engine) {
            record.stage = "ocr_pending";
            record.error = state.engineError;
          } else {
            const image = await renderMutex.run(() => pdf.render(pdfPage, { dpi: config.dpi, maxPixels: config.maxRenderPixels }));
            const result = await engine.recognize(image.png, {
              languages: options.ocrLanguages,
              psm: config.psm,
              timeoutMs: config.timeoutMs,
              detectRotation: config.detectRotation,
              threadsPerJob: config.threadsPerJob,
              tmpDir: path.join(config.dataDir, "tmp"),
              rotate: rotatePng,
            });
            const screen = assessText(result.text, expected);
            const reasons: string[] = [];
            if (screen.verdict !== "usable") reasons.push(`text check: ${screen.reason}`);
            if (result.meanConfidence === null) reasons.push("Tesseract returned no word confidence");
            else if (result.meanConfidence < config.thresholds.minPageConfidence) reasons.push(`mean confidence ${result.meanConfidence.toFixed(1)} is below ${config.thresholds.minPageConfidence}`);
            record.stage = "ocr_completed";
            record.method = "ocr";
            record.text = result.text;
            record.ocr = {
              engine: "tesseract",
              engineVersion: engine.info.version,
              languages: options.ocrLanguages,
              traineddata,
              dpi: config.dpi,
              renderScale: image.scale,
              widthPx: image.width,
              heightPx: image.height,
              psm: config.psm,
              meanConfidence: result.meanConfidence,
              wordCount: result.wordCount,
              rotationDegrees: result.rotationDegrees,
              rotationNote: result.rotationNote,
              elapsedMs: result.elapsedMs,
              screen: { passed: reasons.length === 0, reasons },
            };
          }
        }
      } catch (error) {
        record.stage = "failed";
        record.error = describeError(error);
      }
      record.processedAt = now().toISOString();
      if (outputDir && !(options.dryRun)) await writeJsonAtomic(pageFile(outputDir, pdfPage), record);
      if (!(options.dryRun && record.stage === "ocr_pending")) tally(record, false);
      summaries.set(pdfPage, summarize(record, false));
    };

    const total = options.pages.length;
    let done = 0;
    for (let offset = 0; offset < total && !options.signal?.aborted; offset += config.batchSize) {
      const batch = options.pages.slice(offset, offset + config.batchSize);
      let cursor = 0;
      const workers = Array.from({ length: Math.min(config.concurrency, batch.length) }, async () => {
        while (cursor < batch.length) {
          const page = batch[cursor++] as number;
          await processPage(page);
          done++;
          const elapsed = Date.now() - started;
          options.onProgress?.({
            total,
            done,
            remaining: total - done,
            failed: counts.failed,
            elapsedMs: elapsed,
            etaMs: done > 0 ? Math.round((elapsed / done) * (total - done)) : null,
            message: `page ${page}`,
          });
        }
      });
      await Promise.all(workers);
      if (outputDir) {
        await writeJsonAtomic(path.join(outputDir, "progress.json"), { updatedAt: now().toISOString(), total, done, failed: counts.failed, remaining: total - done, mode: options.mode });
      }
    }
    if (options.signal?.aborted) interrupted = true;
    if (interrupted) notes.push("Run was interrupted. Completed pages are checkpointed. Repeat the same command to resume.");
    if (state.engineError) notes.push(`OCR did not run: ${state.engineError.message}`);
    if (options.dryRun) notes.push("Dry run: no OCR was performed and nothing was written.");

    const ordered = options.pages.map((page) => summaries.get(page)).filter((item): item is PageSummary => Boolean(item));
    return {
      schemaVersion: PAGE_SCHEMA_VERSION,
      bookId: book.bookId,
      fileName: book.fileName,
      sourceSha256,
      numPages: pdf.numPages,
      mode: options.mode,
      dryRun: options.dryRun,
      configHash,
      ocrLanguages: options.ocrLanguages,
      requestedPages: options.pages,
      counts,
      engine: state.engineInfo,
      engineError: state.engineError,
      startedAt: new Date(started).toISOString(),
      elapsedMs: Date.now() - started,
      interrupted,
      pages: ordered,
      notes,
      outputDir,
    };
  } finally {
    await pdf.destroy();
  }
}

export function renderReportMarkdown(report: RunReport): string {
  const lines = [
    `# Ingestion ${report.dryRun ? "dry run" : report.mode} report: ${report.bookId}`,
    "",
    `- File: ${report.fileName}`,
    `- SHA-256: ${report.sourceSha256}`,
    `- PDF pages: ${report.numPages}. Pages requested: ${report.requestedPages.length}`,
    `- OCR languages: ${report.ocrLanguages}`,
    `- Config hash: ${report.configHash}`,
    `- Engine: ${report.engine ? `Tesseract ${report.engine.version}` : "not used"}`,
    `- Elapsed: ${(report.elapsedMs / 1000).toFixed(1)} s${report.interrupted ? " (interrupted)" : ""}`,
    "",
    "## Counts",
    "",
    `- Embedded text used: ${report.counts.textExtracted}`,
    `- OCR completed: ${report.counts.ocrCompleted}`,
    `- OCR pending: ${report.counts.ocrPending}`,
    `- Failed: ${report.counts.failed}`,
    `- Reused from checkpoint: ${report.counts.resumedFromCheckpoint}`,
    `- Would need OCR (dry run): ${report.counts.wouldOcr}`,
    "",
    "OCR output from this run is unmeasured. It is not searchable until a calibration against human-checked transcriptions passes.",
    "",
    "## Pages",
    "",
    "| PDF page | Stage | Method | Chars | Confidence | Screen | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const page of report.pages) {
    const note = page.error
      ? page.error.code
      : page.method === "ocr"
        ? page.screenReasons.join("; ") || `embedded text layer: ${page.embeddedVerdict}`
        : page.embeddedReason || "";
    lines.push(`| ${page.pdfPage} | ${page.stage} | ${page.method ?? "-"} | ${page.characters} | ${page.meanConfidence === null ? "-" : page.meanConfidence.toFixed(1)} | ${page.screenPassed === null ? "-" : page.screenPassed ? "pass" : "fail"} | ${note.replace(/\|/g, "/")} |`);
  }
  if (report.notes.length > 0) lines.push("", "## Notes", "", ...report.notes.map((note) => `- ${note}`));
  if (report.engineError) lines.push("", "## OCR engine problem", "", report.engineError.message, ...(report.engineError.hint ? ["", "```", report.engineError.hint, "```"] : []));
  const previews = report.pages.filter((page) => page.preview);
  if (previews.length > 0) {
    lines.push("", "## Previews (raw extracted text, unedited)", "");
    for (const page of previews) lines.push(`### Page ${page.pdfPage}`, "", "```text", page.preview ?? "", "```", "");
  }
  return `${lines.join("\n")}\n`;
}

export async function saveReport(report: RunReport, file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(report, null, 2), "utf8");
  await writeFile(file.replace(/\.json$/i, ".md"), renderReportMarkdown(report), "utf8");
}
