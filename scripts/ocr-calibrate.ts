import { readFile } from "fs/promises";
import path from "path";
import { parseArgs } from "util";
import { listBooks, resolveBook } from "../src/server/ocr/books";
import { evaluateCalibration, importReference, saveCalibrationReport, selectSamples, writeSamples, calibrationDir } from "../src/server/ocr/calibration";
import { loadOcrConfig } from "../src/server/ocr/config";
import { OcrError, describeError } from "../src/server/ocr/errors";
import { listConfigDirs, listPageRecords, sha256Hex, type ConfigDir } from "../src/server/ocr/pipeline";
import { booksDirectory, loadProjectEnv } from "../src/server/ocr/runtime";

const USAGE = `Usage:
  npm run ocr:calibrate -- select   --book <id> [--count 12] [--with-draft] [--config <hash>]
  npm run ocr:calibrate -- import   --book <id> --page <pdf page> --file <reference.txt> --reviewer "Name" [--edition "..."] [--notes "..."] [--confirm-identical]
  npm run ocr:calibrate -- evaluate --book <id> [--config <hash>]
  npm run ocr:calibrate -- status   --book <id> [--config <hash>]

The reference file must be your own transcription of the page image, typed or corrected by a person.
Do not copy the OCR text and save it as the reference.`;

async function main() {
  loadProjectEnv();
  const { values, positionals } = parseArgs({
    options: {
      book: { type: "string" },
      count: { type: "string" },
      page: { type: "string" },
      file: { type: "string" },
      reviewer: { type: "string" },
      edition: { type: "string" },
      notes: { type: "string" },
      config: { type: "string" },
      "with-draft": { type: "boolean", default: false },
      "confirm-identical": { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  const command = positionals[0];
  if (!command || !["select", "import", "evaluate", "status"].includes(command) || !values.book) {
    console.log(USAGE);
    process.exit(2);
  }
  const config = loadOcrConfig();
  const book = resolveBook(await listBooks(booksDirectory()), values.book as string);
  const bytes = new Uint8Array(await readFile(book.filePath));
  const sha256 = sha256Hex(bytes);
  const dirs = await listConfigDirs(config, sha256);
  if (dirs.length === 0) throw new OcrError("CONFIG_INVALID", `No OCR output exists for ${book.bookId} yet. Run: npm run ingest:pilot -- --book ${book.bookId}`);
  let chosen: ConfigDir | undefined = dirs[0];
  if (values.config) chosen = dirs.find((item) => item.configHash === values.config);
  if (!chosen) throw new OcrError("CONFIG_INVALID", `Unknown config ${values.config}. Available: ${dirs.map((item) => item.configHash).join(", ")}`);
  if (!values.config && dirs.length > 1) console.log(`Using the most recent OCR configuration ${chosen.configHash}. Others: ${dirs.slice(1).map((item) => item.configHash).join(", ")}. Pass --config to choose.`);
  const common = { outputDir: chosen.dir, bookId: book.bookId, numPages: chosen.numPages, sourceSha256: sha256, configHash: chosen.configHash, language: book.language, ocrLanguages: chosen.ocrLanguages, thresholds: config.thresholds };

  if (command === "select") {
    const count = values.count ? Number(values.count) : Math.max(12, config.thresholds.minCalibrationPages + 2);
    if (!Number.isInteger(count) || count < 3) throw new OcrError("CONFIG_INVALID", "--count must be a whole number of at least 3.");
    const records = await listPageRecords(chosen.dir);
    const samples = selectSamples(records, chosen.numPages, count, config.thresholds);
    const ocrPages = records.filter((record) => record.stage === "ocr_completed").length;
    const file = await writeSamples(chosen.dir, samples, records, values["with-draft"] === true);
    console.log(`OCR'd pages available for sampling: ${ocrPages}. Samples chosen: ${samples.length}.`);
    if (ocrPages < config.thresholds.minCalibrationPages) {
      console.log(`Only ${ocrPages} pages have OCR output, fewer than the ${config.thresholds.minCalibrationPages} reliable references the gate needs. Run a larger pilot (for example --limit ${config.pilotMaxPages}) before selecting.`);
    }
    for (const sample of samples) console.log(`  page ${sample.pdfPage}: ${sample.strata.join(", ")}${sample.meanConfidence === null ? "" : `, confidence ${sample.meanConfidence.toFixed(1)}`}${sample.rotationDegrees ? `, rotated ${sample.rotationDegrees}` : ""}`);
    console.log(`\nSample list: ${file}`);
    console.log(`For each page, open the PDF at that page, transcribe the full page yourself, save it as UTF-8 text, then run:`);
    console.log(`  npm run ocr:calibrate -- import --book ${book.bookId} --page <n> --file <your-transcription.txt> --reviewer "Your Name" --edition "<edition as printed on the title page>"`);
    if (values["with-draft"]) console.log(`Drafts (raw OCR to correct) are in ${path.join(calibrationDir(chosen.dir), "draft")}. A reference that is unchanged from its draft is excluded unless you pass --confirm-identical.`);
    return;
  }

  if (command === "import") {
    if (!values.page || !values.file || !values.reviewer) throw new OcrError("CONFIG_INVALID", "import needs --page, --file and --reviewer.");
    const pdfPage = Number(values.page);
    if (!Number.isInteger(pdfPage) || pdfPage < 1) throw new OcrError("CONFIG_INVALID", "--page must be a PDF page number.");
    const referenceText = await readFile(path.resolve(values.file), "utf8");
    const { meta, warnings } = await importReference({ outputDir: chosen.dir, pdfPage, referenceText, reviewer: values.reviewer, edition: values.edition ?? null, notes: values.notes ?? "", confirmIdentical: values["confirm-identical"] === true });
    console.log(`Reference stored for PDF page ${meta.pdfPage}, reviewer ${meta.reviewer}, ${meta.reviewedOn}.`);
    for (const warning of warnings) console.log(`warning: ${warning}`);
    return;
  }

  const report = await evaluateCalibration(common);
  const file = await saveCalibrationReport(chosen.dir, report);
  const strict = report.aggregate.strict;
  const folded = report.aggregate.folded;
  console.log(`Verdict: ${report.verdict.status}`);
  for (const reason of report.verdict.reasons) console.log(`  ${reason}`);
  console.log(`Reliable reference pages: ${report.reliableSampleCount}. Missing references: ${report.missingReferences.length}. Excluded: ${report.excludedSamples.length}.`);
  if (strict && folded) {
    console.log(`Strict: CER ${(strict.cer * 100).toFixed(2)}%, WER ${(strict.wer * 100).toFixed(2)}%, critical-token errors ${strict.criticalErrors}/${strict.criticalReferenceTokens}`);
    console.log(`Folded: CER ${(folded.cer * 100).toFixed(2)}%, WER ${(folded.wer * 100).toFixed(2)}%, critical-token errors ${folded.criticalErrors}/${folded.criticalReferenceTokens}`);
  }
  if (report.coverage.missing.length > 0) console.log(`Required strata without a reliable sample: ${report.coverage.missing.join(", ")}`);
  console.log(`Report: ${file}`);
  if (command === "status") return;
}

main().catch((error: unknown) => {
  const info = describeError(error);
  console.error(`${info.code}: ${info.message}`);
  if (info.hint) console.error(info.hint);
  process.exit(info.code === "CONFIG_INVALID" ? 2 : 1);
});
