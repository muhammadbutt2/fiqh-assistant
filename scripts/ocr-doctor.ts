import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { parseArgs } from "util";
import { assessText, scriptForLanguage } from "../src/server/ocr/assess";
import { listBooks, type BookMeta } from "../src/server/ocr/books";
import { evaluateCalibration } from "../src/server/ocr/calibration";
import { loadOcrConfig, type OcrConfig } from "../src/server/ocr/config";
import { describeError } from "../src/server/ocr/errors";
import { listConfigDirs, listPageRecords, sha256Hex } from "../src/server/ocr/pipeline";
import { openPdf } from "../src/server/ocr/render";
import { booksDirectory, loadProjectEnv, openStore } from "../src/server/ocr/runtime";
import { createTesseractEngine, inspectEngine, requireLanguages } from "../src/server/ocr/tesseract";

type BookFinding = {
  bookId: string;
  fileName: string;
  bytes: number;
  sha256: string;
  pages: number | null;
  sampledPages: number[];
  sampleVerdicts: { usable: number; unusable: number; absent: number };
  textLayer: "text" | "scanned" | "text_layer_unusable" | "hybrid" | "unreadable";
  ocrLanguages: string;
  duplicateOf: string | null;
  ocrRuns: { configHash: string; pagesProcessed: number; ocrCompleted: number; failed: number; calibration: string }[];
  storeStatus: { ocrStatus: string; searchable: boolean; rights: string } | null;
  blockedBecause: string[];
  error: string | null;
};

function samplePages(numPages: number, count: number): number[] {
  const picked = new Set<number>();
  for (let index = 0; index < Math.min(count, numPages); index++) picked.add(Math.min(numPages, Math.floor(((index + 0.5) / Math.min(count, numPages)) * numPages) + 1));
  return Array.from(picked).sort((a, b) => a - b);
}

async function inspectBook(book: BookMeta, config: OcrConfig, store: Awaited<ReturnType<typeof openStore>>, seen: Map<string, string>): Promise<BookFinding> {
  const finding: BookFinding = {
    bookId: book.bookId,
    fileName: book.fileName,
    bytes: 0,
    sha256: "",
    pages: null,
    sampledPages: [],
    sampleVerdicts: { usable: 0, unusable: 0, absent: 0 },
    textLayer: "unreadable",
    ocrLanguages: book.ocrLanguages,
    duplicateOf: null,
    ocrRuns: [],
    storeStatus: null,
    blockedBecause: [],
    error: null,
  };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(book.filePath));
  } catch (error) {
    finding.error = describeError(error).message;
    finding.blockedBecause.push("File could not be read.");
    return finding;
  }
  finding.bytes = bytes.length;
  finding.sha256 = sha256Hex(bytes);
  const first = seen.get(finding.sha256);
  if (first) finding.duplicateOf = first;
  else seen.set(finding.sha256, book.bookId);

  try {
    const pdf = await openPdf(bytes);
    finding.pages = pdf.numPages;
    finding.sampledPages = samplePages(pdf.numPages, 8);
    const expected = scriptForLanguage(book.language);
    for (const page of finding.sampledPages) {
      const verdict = assessText(await pdf.getText(page), expected).verdict;
      finding.sampleVerdicts[verdict]++;
    }
    await pdf.destroy();
    const { usable, unusable, absent } = finding.sampleVerdicts;
    finding.textLayer = usable === finding.sampledPages.length ? "text" : usable > 0 ? "hybrid" : unusable > 0 ? "text_layer_unusable" : "scanned";
    void absent;
  } catch (error) {
    finding.error = describeError(error).message;
    finding.blockedBecause.push(`PDF could not be opened: ${finding.error}`);
    return finding;
  }

  const dirs = await listConfigDirs(config, finding.sha256);
  for (const dir of dirs) {
    const records = await listPageRecords(dir.dir);
    let calibration = "not evaluated";
    try {
      const report = await evaluateCalibration({ outputDir: dir.dir, bookId: book.bookId, numPages: dir.numPages, sourceSha256: finding.sha256, configHash: dir.configHash, language: book.language, ocrLanguages: dir.ocrLanguages, thresholds: config.thresholds });
      calibration = `${report.verdict.status} (${report.reliableSampleCount} reliable reference pages)`;
    } catch {
      calibration = "could not be evaluated";
    }
    finding.ocrRuns.push({ configHash: dir.configHash, pagesProcessed: records.length, ocrCompleted: records.filter((record) => record.stage === "ocr_completed").length, failed: records.filter((record) => record.stage === "failed").length, calibration });
  }

  const document = await store.getDocumentByHash(finding.sha256);
  if (document) finding.storeStatus = { ocrStatus: document.ocrStatus, searchable: document.searchable, rights: document.rightsStatus };

  if (finding.duplicateOf) finding.blockedBecause.push(`Byte-identical to ${finding.duplicateOf}. Only one copy is ingested.`);
  else if (finding.textLayer === "text") finding.blockedBecause.push(finding.storeStatus?.searchable ? "" : "Embedded text is usable. Run the index step and approve rights and metadata.");
  else if (finding.ocrRuns.length === 0) finding.blockedBecause.push(`No OCR has been run (${finding.textLayer.replace(/_/g, " ")}). Run a pilot first.`);
  else if (!finding.ocrRuns.some((run) => run.calibration.startsWith("passed"))) {
    finding.blockedBecause.push(`OCR accuracy is not proven. Best calibration status: ${finding.ocrRuns.map((run) => run.calibration).join("; ")}.`);
  }
  if (!finding.storeStatus?.searchable && finding.storeStatus?.rights !== "approved_for_ingestion" && !finding.duplicateOf) finding.blockedBecause.push("Rights and metadata approval is not recorded.");
  finding.blockedBecause = finding.blockedBecause.filter(Boolean);
  return finding;
}

async function main() {
  const loaded = loadProjectEnv();
  const { values } = parseArgs({ options: { json: { type: "boolean", default: false }, "no-smoke": { type: "boolean", default: false }, book: { type: "string" } }, strict: true });
  const out: string[] = [];
  const say = (line = "") => { if (!values.json) console.log(line); out.push(line); };

  const config = loadOcrConfig();
  const blockers: string[] = [];

  say("== Environment");
  say(`  env files loaded: ${loaded.join(", ") || "none"}`);
  say(`  BOOKS_DIR: ${process.env.BOOKS_DIR || "(not set)"}`);
  say(`  TESSERACT_CMD: ${config.tesseractCmd ?? "(not set, PATH and standard install folders are searched)"}`);
  say(`  TESSDATA_PREFIX: ${config.tessdataDir ?? "(not set, project .data/tessdata is tried next)"}`);
  say(`  OCR data directory: ${config.dataDir}`);
  say(`  store: ${process.env.DATABASE_URL ? "PostgreSQL via DATABASE_URL" : path.resolve(process.env.STORE_PATH || ".data/store.json")}`);
  say(`  render ${config.dpi} dpi (cap ${config.maxRenderPixels} px), psm ${config.psm}, rotation detection ${config.detectRotation}, concurrency ${config.concurrency}, batch ${config.batchSize}, timeout ${config.timeoutMs} ms`);
  const t = config.thresholds;
  say(`  gate (${t.gateMetric}): CER <= ${t.maxCer}, WER <= ${t.maxWer}, critical-token errors <= ${t.maxCriticalErrorRate}, page CER <= ${t.maxPageCer}, >= ${t.minCalibrationPages} reliable reference pages, reference >= ${t.minReferenceChars} chars, page confidence >= ${t.minPageConfidence}${t.loosened ? "  ** LOOSENED **" : ""}`);

  say("\n== Tesseract");
  const inspection = await inspectEngine(config);
  let engine: ReturnType<typeof createTesseractEngine> | null = null;
  if (!inspection.ok) {
    say(`  NOT AVAILABLE [${inspection.error.code}]: ${inspection.error.message}`);
    if (inspection.error.hint) say(`  ${inspection.error.hint}`);
    blockers.push(inspection.error.message);
  } else {
    const info = inspection.info;
    engine = createTesseractEngine(info);
    say(`  command: ${info.command}`);
    say(`  version: ${info.version}`);
    say(`  language data folder: ${info.tessdataDir ?? "engine default"} (${info.tessdataSource})`);
    say(`  installed languages: ${info.installedLanguages.join(", ") || "none"}`);
    for (const lang of ["ara", "urd", "eng"]) say(`  ${lang}: ${info.installedLanguages.includes(lang) ? `present (fingerprint ${info.traineddata[lang] ?? "n/a"})` : "MISSING"}`);
    say(`  osd (rotation detection): ${info.installedLanguages.includes("osd") ? "present" : "missing, OCR_DETECT_ROTATION cannot be used"}`);
    for (const warning of inspection.warnings) say(`  warning: ${warning}`);
    for (const lang of ["ara", "urd"]) {
      try { requireLanguages(info, lang); } catch (error) {
        const detail = describeError(error);
        blockers.push(detail.message);
        say(`  ${detail.hint?.split("\n").map((line) => `  ${line}`).join("\n") ?? ""}`);
      }
    }
  }

  say("\n== PDF rendering");
  let books: BookMeta[] = [];
  try {
    books = await listBooks(booksDirectory());
  } catch (error) {
    const detail = describeError(error);
    say(`  cannot list books: ${detail.message}`);
    if (detail.hint) say(`  ${detail.hint}`);
    blockers.push(detail.message);
  }
  if (values.book) books = books.filter((book) => book.bookId === values.book);
  const store = await openStore();
  const findings: BookFinding[] = [];
  const seen = new Map<string, string>();
  for (const book of books) findings.push(await inspectBook(book, config, store, seen));

  let renderOk = false;
  let smoke: Record<string, unknown> | null = null;
  const scanned = findings.find((finding) => finding.textLayer === "scanned" && !finding.duplicateOf) ?? findings.find((finding) => finding.pages);
  if (scanned && scanned.pages) {
    const book = books.find((item) => item.bookId === scanned.bookId) as BookMeta;
    try {
      const pdf = await openPdf(new Uint8Array(await readFile(book.filePath)));
      const page = Math.min(scanned.pages, Math.max(1, Math.floor(scanned.pages / 3)));
      const started = Date.now();
      const image = await pdf.render(page, { dpi: config.dpi, maxPixels: config.maxRenderPixels });
      renderOk = image.png.length > 0 && image.width > 0;
      say(`  @napi-rs/canvas via unpdf: rendered ${book.bookId} page ${page} to ${image.width}x${image.height} PNG (${Math.round(image.png.length / 1024)} KB) in ${Date.now() - started} ms at scale ${image.scale.toFixed(2)}`);
      if (!values["no-smoke"] && engine && inspection.ok) {
        try {
          requireLanguages(inspection.info, book.ocrLanguages);
          const result = await engine.recognize(image.png, { languages: book.ocrLanguages, psm: config.psm, timeoutMs: config.timeoutMs, detectRotation: false, threadsPerJob: 0, tmpDir: path.join(config.dataDir, "tmp") });
          smoke = { book: book.bookId, page, languages: book.ocrLanguages, characters: result.text.replace(/\s+/g, "").length, words: result.wordCount, meanConfidence: result.meanConfidence, elapsedMs: result.elapsedMs };
          say(`  OCR smoke test (1 page, not stored): ${book.ocrLanguages}, ${smoke.characters} characters, ${result.wordCount} words, confidence ${result.meanConfidence?.toFixed(1) ?? "n/a"}, ${result.elapsedMs} ms`);
          if (smoke.characters === 0) {
            say("  OCR smoke test FAILED: no text came back. The page probably rendered blank (image decoder problem) or the language data is wrong.");
            blockers.push("OCR smoke test returned no text.");
          }
        } catch (error) {
          const detail = describeError(error);
          say(`  OCR smoke test FAILED [${detail.code}]: ${detail.message}`);
          blockers.push(`OCR smoke test failed: ${detail.message}`);
        }
      }
      await pdf.destroy();
    } catch (error) {
      say(`  render FAILED: ${describeError(error).message}`);
    }
  } else say("  no readable PDF available to test rendering");
  if (!renderOk && scanned?.pages) blockers.push("PDF rendering did not work. Run npm install and check @napi-rs/canvas.");

  say("\n== PDFs");
  for (const finding of findings) {
    say(`  ${finding.bookId} (${finding.fileName})`);
    say(`    ${finding.pages ?? "?"} pages, ${(finding.bytes / 1048576).toFixed(1)} MB, sha256 ${finding.sha256.slice(0, 16)}...`);
    say(`    text layer (${finding.sampledPages.length} sampled pages: ${finding.sampleVerdicts.usable} usable, ${finding.sampleVerdicts.unusable} unusable, ${finding.sampleVerdicts.absent} empty): ${finding.textLayer}. OCR language if needed: ${finding.ocrLanguages}`);
    if (finding.ocrRuns.length > 0) for (const run of finding.ocrRuns) say(`    OCR run ${run.configHash}: ${run.pagesProcessed} pages processed, ${run.ocrCompleted} OCR completed, ${run.failed} failed. Calibration: ${run.calibration}`);
    else say("    no OCR output yet");
    say(`    store: ${finding.storeStatus ? `ocrStatus=${finding.storeStatus.ocrStatus}, searchable=${finding.storeStatus.searchable}, rights=${finding.storeStatus.rights}` : "not registered"}`);
    for (const reason of finding.blockedBecause) say(`    blocked: ${reason}`);
  }
  const counts = { text: 0, scanned: 0, text_layer_unusable: 0, hybrid: 0, unreadable: 0 };
  for (const finding of findings.filter((item) => !item.duplicateOf)) counts[finding.textLayer]++;
  say(`\n  distinct PDFs: ${findings.filter((item) => !item.duplicateOf).length}. Text layer: ${counts.text}, scanned: ${counts.scanned}, unusable text layer: ${counts.text_layer_unusable}, hybrid: ${counts.hybrid}, unreadable: ${counts.unreadable}.`);
  say("  Classification is based on a sample of pages per file, not every page. The pipeline decides page by page.");

  say("\n== Summary");
  const anySearchable = findings.some((finding) => finding.storeStatus?.searchable);
  say(`  searchable PDFs: ${findings.filter((finding) => finding.storeStatus?.searchable).length}`);
  if (blockers.length === 0 && !anySearchable) say("  Tooling works. Ingestion is blocked only by missing OCR runs, calibration references, and approval.");
  for (const blocker of Array.from(new Set(blockers))) say(`  blocker: ${blocker}`);

  const report = { generatedAt: new Date().toISOString(), config: { ...config, tesseractCmd: config.tesseractCmd }, engine: inspection.ok ? inspection.info : null, engineError: inspection.ok ? null : describeError(inspection.error), renderOk, smoke, books: findings, blockers };
  await mkdir(config.dataDir, { recursive: true });
  const file = path.join(config.dataDir, "doctor-report.json");
  await writeFile(file, JSON.stringify(report, null, 2), "utf8");
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else say(`\n  report saved: ${file}`);
}

main().catch((error: unknown) => {
  const info = describeError(error);
  console.error(`${info.code}: ${info.message}`);
  if (info.hint) console.error(info.hint);
  process.exit(info.code === "CONFIG_INVALID" ? 2 : 1);
});
