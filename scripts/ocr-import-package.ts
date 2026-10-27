import { copyFile, mkdir, readdir, readFile } from "fs/promises";
import path from "path";
import { parseArgs } from "util";
import { listBooks, registryWork, resolveBook, volumeFromTitle } from "../src/server/ocr/books";
import { evaluateCalibration, readSamples, saveCalibrationReport } from "../src/server/ocr/calibration";
import { loadOcrConfig } from "../src/server/ocr/config";
import { OcrError, describeError } from "../src/server/ocr/errors";
import {
  importPackagePages,
  parseOcrTextPackage,
  readOptionalFile,
  writeCoverageReport,
  type ImportCoverage,
} from "../src/server/ocr/import-package";
import { indexBook } from "../src/server/ocr/index-pages";
import { listConfigDirs, listPageRecords, sha256Hex } from "../src/server/ocr/pipeline";
import { openPdf } from "../src/server/ocr/render";
import { booksDirectory, loadProjectEnv, openStore } from "../src/server/ocr/runtime";

const USAGE = `Usage:
  npm run ocr:import-package -- [--book al-qaduri] [--incoming <dir>] [--config <hash>] [--dry-run] [--skip-index]

Copies a found full-book OCR package into .data/incoming/<book>/ if needed, writes missing page
records into the existing Tesseract configuration folder without overwriting the pilot, then
indexes the book without approval. Imported text stays labelled candidate OCR.`;

const PACKAGE_FILES = [
  { name: "al-qaduri.pdf", role: "original PDF" },
  { name: "al-qaduri-searchable.pdf", role: "searchable PDF with OCR text layer" },
  { name: "al-qaduri-ocr-text.txt", role: "extracted Arabic text" },
  { name: "al-qaduri-pages.jsonl", role: "page-wise JSONL records" },
  { name: "ocr-metadata.json", role: "OCR metadata" },
  { name: "ocr-report.md", role: "OCR report" },
  { name: "ocr-report.json", role: "OCR report JSON" },
] as const;

function downloadsDir(): string {
  return process.env.OCR_PACKAGE_DOWNLOADS?.trim() || path.join(process.env.USERPROFILE || process.env.HOME || "", "Downloads");
}

async function copyIfMissing(from: string, to: string): Promise<"copied" | "exists" | "missing"> {
  const dest = await readOptionalFile(to);
  if (dest.present) return "exists";
  const src = await readOptionalFile(from);
  if (!src.present) return "missing";
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
  return "copied";
}

async function countHumanReferences(outputDir: string): Promise<number> {
  try {
    const names = await readdir(path.join(outputDir, "calibration", "reference"));
    return names.filter((name) => /^p\d+\.txt$/.test(name)).length;
  } catch {
    return 0;
  }
}

async function main() {
  loadProjectEnv();
  const { values } = parseArgs({
    options: {
      book: { type: "string", default: "al-qaduri" },
      incoming: { type: "string" },
      config: { type: "string" },
      help: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "skip-index": { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const cwd = process.cwd();
  const bookId = values.book as string;
  const incomingDir = path.resolve(values.incoming ?? path.join(cwd, ".data", "incoming", bookId));
  const notes: string[] = [];
  await mkdir(incomingDir, { recursive: true });

  const searchRoots = [
    incomingDir,
    path.join(cwd, ".data", "incoming"),
    downloadsDir(),
  ];
  let booksDir: string | null = null;
  try {
    booksDir = booksDirectory();
    searchRoots.push(booksDir);
  } catch (error) {
    notes.push(`BOOKS_DIR was not used: ${describeError(error).message}`);
  }

  const copyPlan = [
    { name: "al-qaduri-ocr-text.txt", roots: searchRoots },
    { name: "al-qaduri-searchable.pdf", roots: searchRoots },
    { name: "al-qaduri.pdf", roots: searchRoots },
  ];
  for (const item of copyPlan) {
    const dest = path.join(incomingDir, item.name);
    let outcome: "copied" | "exists" | "missing" = "missing";
    for (const root of item.roots) {
      if (!root) continue;
      const from = path.join(root, item.name);
      if (path.resolve(from) === path.resolve(dest)) {
        const already = await readOptionalFile(dest);
        if (already.present) {
          outcome = "exists";
          break;
        }
        continue;
      }
      outcome = await copyIfMissing(from, dest);
      if (outcome !== "missing") {
        if (outcome === "copied") notes.push(`Copied ${item.name} from ${from} into ${incomingDir}.`);
        break;
      }
    }
    if (outcome === "missing") notes.push(`${item.name} was not found in: ${item.roots.filter(Boolean).join("; ")}.`);
  }

  const listed = new Set<string>();
  try {
    for (const name of await readdir(incomingDir)) listed.add(name);
  } catch {
    // Directory listing failed; file checks below still run.
  }
  const extra = Array.from(listed).filter((name) => !PACKAGE_FILES.some((item) => item.name === name));
  if (extra.length > 0) notes.push(`Additional files in the package directory: ${extra.join(", ")}.`);

  const files: ImportCoverage["files"] = [];
  for (const item of PACKAGE_FILES) {
    const info = await readOptionalFile(path.join(incomingDir, item.name));
    files.push({ name: `${item.name} (${item.role})`, present: info.present, bytes: info.bytes });
    if (!info.present) notes.push(`Package did not include ${item.name} (${item.role}).`);
  }

  const textPath = path.join(incomingDir, "al-qaduri-ocr-text.txt");
  const textInfo = await readOptionalFile(textPath);
  if (!textInfo.present) {
    console.error(`No extracted-text package was found.`);
    console.error(`Expected: ${textPath}`);
    console.error(`Also looked in: ${searchRoots.join("; ")}`);
    process.exit(2);
  }

  const text = await readFile(textPath, "utf8");
  const parsed = parseOcrTextPackage(text);
  notes.push(`Parsed ${parsed.pages.length} page markers from al-qaduri-ocr-text.txt. Declared pages: ${parsed.declaredPages}.`);
  if (parsed.header) notes.push(`Package header: ${parsed.header.split(/\r?\n/)[0]}`);
  if (parsed.missingPageNumbers.length > 0) notes.push(`Package is missing page markers for: ${parsed.missingPageNumbers.join(", ")}.`);
  notes.push("Imported records are unverified machine OCR. Printed page numbers were not assigned. Accuracy is unmeasured.");

  const ocrConfig = loadOcrConfig();
  const book = resolveBook(await listBooks(booksDirectory()), bookId);
  const bytes = new Uint8Array(await readFile(book.filePath));
  const sha256 = sha256Hex(bytes);
  const dirs = await listConfigDirs(ocrConfig, sha256);
  const chosen = values.config ? dirs.find((item) => item.configHash === values.config) : dirs[0];
  if (!chosen) {
    throw new OcrError("CONFIG_INVALID", `No OCR output for ${book.bookId}. Run the Tesseract pilot first: npm run ingest:pilot -- --book ${book.bookId}`);
  }
  notes.push(`Writing missing pages into existing configuration ${chosen.configHash} at ${chosen.dir}. Existing Tesseract page JSON is not overwritten.`);

  const imported = await importPackagePages({
    outputDir: chosen.dir,
    bookSourceSha256: sha256,
    parsed,
    recordConfigHash: chosen.configHash,
    dryRun: values["dry-run"] === true,
  });
  notes.push(`Package fingerprint ${imported.packageFingerprint}.`);

  const pdf = await openPdf(bytes);
  const info = pdf.info;
  const numPages = pdf.numPages;
  await pdf.destroy();
  if (parsed.declaredPages && parsed.declaredPages !== numPages) {
    notes.push(`Package declared ${parsed.declaredPages} pages; the original PDF has ${numPages}.`);
  }

  const humanReferences = await countHumanReferences(chosen.dir);
  const samples = await readSamples(chosen.dir);
  notes.push(`Existing calibration samples: ${samples.length === 0 ? "none" : samples.map((item) => item.pdfPage).join(", ")}. Human references on disk: ${humanReferences}.`);
  notes.push("Calibration thresholds were not changed. Do not copy OCR output into reference/.");

  let candidateChunksAfterIndex: number | null = null;
  let approvedChunks = 0;
  let searchable = false;
  let verdict = "not evaluated in this run";

  if (!values["skip-index"] && values["dry-run"] !== true) {
    const store = await openStore();
    const calibration = await evaluateCalibration({
      outputDir: chosen.dir,
      bookId: book.bookId,
      numPages,
      sourceSha256: sha256,
      configHash: chosen.configHash,
      language: book.language,
      ocrLanguages: chosen.ocrLanguages,
      thresholds: ocrConfig.thresholds,
    });
    const reportFile = await saveCalibrationReport(chosen.dir, calibration);
    verdict = calibration.verdict.status;
    const work = registryWork(book.workId);
    const result = await indexBook({
      store,
      meta: {
        title: info.title ?? work?.title ?? book.fileName,
        author: info.author ?? work?.author ?? "",
        authorNote: info.author ? "Author is the PDF info field." : work ? "Author is the project registry's author for the work. It was not read from this file." : "Author unknown.",
        language: book.language,
        madhhab: book.madhhab,
        sourceClass: book.sourceClass,
        volume: volumeFromTitle(info.title),
        workId: book.workId,
        fileName: book.fileName,
        filePath: book.filePath,
      },
      sourceSha256: sha256,
      configHash: chosen.configHash,
      numPages,
      outputDir: chosen.dir,
      config: ocrConfig,
      calibration,
      approval: null,
      dryRun: false,
    });
    candidateChunksAfterIndex = result.candidateChunks;
    searchable = result.searchable;
    const stored = (await store.listChunks()).filter((chunk) => chunk.documentId === result.documentId);
    approvedChunks = stored.filter((chunk) => chunk.searchable && chunk.ocrQuality === "acceptable").length;
    notes.push(`Indexed without --approve. Calibration verdict ${verdict} (report ${reportFile}). Document searchable=${result.searchable}, ocrStatus=${result.ocrStatus}.`);
    notes.push(`Stored chunks: ${result.chunks} total, ${result.candidateChunks} labelled candidates, ${approvedChunks} approved/searchable.`);
    if (result.searchable) notes.push("Unexpected: the document became searchable. Approval and measurement gates should have blocked this.");
  } else if (values["dry-run"] === true) {
    notes.push("Dry run: page JSON and the store were not written.");
  }

  const records = values["dry-run"] === true ? [] : await listPageRecords(chosen.dir);
  const coverage: ImportCoverage = {
    packageFound: true,
    packageDir: incomingDir,
    files,
    totalPdfPages: numPages,
    pagesWithExtractedText: parsed.pages.filter((page) => !page.empty).length,
    pagesEmptyOrFailed: parsed.pages.filter((page) => page.empty).length + parsed.missingPageNumbers.length,
    existingPilotPages: imported.existingPilotPages.length,
    newlyImportedPages: imported.newlyImportedPages.length,
    duplicatePagesSkipped: imported.duplicatePagesSkipped.length,
    missingFromPackage: parsed.missingPageNumbers,
    candidateChunksAfterIndex,
    approvedChunks,
    verifiedChunks: approvedChunks,
    searchable,
    calibrationHumanReferences: humanReferences,
    accuracyMeasured: verdict === "passed",
    notes,
  };
  const coverageFile = await writeCoverageReport(chosen.dir, coverage);
  const pageCount = records.length;
  const importedEngine = records.filter((record) => record.ocr?.engine === "imported_package").length;
  const tesseractEngine = records.filter((record) => record.ocr?.engine === "tesseract").length;

  console.log(`Package directory: ${incomingDir}`);
  for (const file of files) console.log(`  ${file.present ? "present" : "missing"} ${file.name}${file.bytes != null ? ` (${file.bytes} bytes)` : ""}`);
  console.log(`PDF pages: ${coverage.totalPdfPages}`);
  console.log(`Pages with extracted text: ${coverage.pagesWithExtractedText}`);
  console.log(`Pages empty or failed: ${coverage.pagesEmptyOrFailed}`);
  console.log(`Existing Tesseract pilot pages reused: ${coverage.existingPilotPages} (${imported.existingPilotPages.join(", ") || "none"})`);
  console.log(`Newly imported candidate pages: ${coverage.newlyImportedPages}`);
  console.log(`Duplicate pages skipped: ${coverage.duplicatePagesSkipped}`);
  console.log(`Page JSON after import: ${pageCount} (tesseract=${tesseractEngine}, imported_package=${importedEngine})`);
  console.log(`Candidate chunks: ${candidateChunksAfterIndex ?? "not indexed"}`);
  console.log(`Approved / verified / searchable chunks: ${approvedChunks} / ${approvedChunks} / ${searchable ? "yes" : "no"}`);
  console.log(`Human calibration references: ${humanReferences}`);
  console.log(`Accuracy measured: ${coverage.accuracyMeasured ? "yes" : "no"} (verdict ${verdict})`);
  console.log(`Coverage report: ${coverageFile}`);
  for (const note of notes) console.log(`  note: ${note}`);
}

main().catch((error: unknown) => {
  const info = describeError(error);
  console.error(`${info.code}: ${info.message}`);
  if (info.hint) console.error(info.hint);
  process.exit(info.code === "CONFIG_INVALID" ? 2 : 1);
});
