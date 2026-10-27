import { readFile } from "fs/promises";
import { parseArgs } from "util";
import { listBooks, registryWork, resolveBook, volumeFromTitle } from "../src/server/ocr/books";
import { evaluateCalibration, saveCalibrationReport } from "../src/server/ocr/calibration";
import { loadOcrConfig } from "../src/server/ocr/config";
import { OcrError, describeError } from "../src/server/ocr/errors";
import { indexBook, quarantineUnmeasuredOcr } from "../src/server/ocr/index-pages";
import { listConfigDirs, sha256Hex } from "../src/server/ocr/pipeline";
import { openPdf } from "../src/server/ocr/render";
import { booksDirectory, loadProjectEnv, openStore } from "../src/server/ocr/runtime";

const USAGE = `Usage (stop the dev server first: the JSON store is rewritten):
  npm run ocr:index -- book --book <id> [--config <hash>] [--dry-run]
  npm run ocr:index -- book --book <id> --approve "<review note>" --reviewer "Name"
  npm run ocr:index -- quarantine --sha <document sha256 prefix>

book: re-evaluates the calibration with the current thresholds, then registers the book.
      Pages that passed measurement are stored as review/index chunks.
      Unmeasured OCR with text is stored as labelled candidate chunks (not searchable, not approved evidence).
      Without --approve every stored chunk stays non-searchable.
      --approve records your rights and metadata review. It cannot make a page searchable if the measurement gates failed.
quarantine: marks a document's chunks as unmeasured OCR and removes them from search.`;

async function main() {
  loadProjectEnv();
  const { values, positionals } = parseArgs({
    options: { book: { type: "string" }, config: { type: "string" }, approve: { type: "string" }, reviewer: { type: "string" }, "dry-run": { type: "boolean", default: false }, sha: { type: "string" } },
    allowPositionals: true,
    strict: true,
  });
  const command = positionals[0];
  const config = loadOcrConfig();
  const store = await openStore();

  if (command === "quarantine") {
    if (!values.sha || values.sha.length < 8) throw new OcrError("CONFIG_INVALID", "quarantine needs --sha with at least 8 characters of the document sha256.");
    const matches = (await store.listDocuments()).filter((document) => document.sha256.startsWith(values.sha as string));
    if (matches.length !== 1) throw new OcrError("CONFIG_INVALID", `${matches.length} documents match that prefix. Use more characters.`);
    const document = matches[0];
    if (!document) return;
    const result = await quarantineUnmeasuredOcr(store, document.id, "third_party_ocr_unmeasured");
    console.log(`Quarantined ${document.title}: ${result.chunks} chunks are now unmeasured OCR and not searchable.`);
    return;
  }

  if (command !== "book" || !values.book) {
    console.log(USAGE);
    process.exit(2);
  }
  if (values.approve && !values.reviewer) throw new OcrError("CONFIG_INVALID", "--approve needs --reviewer so the approval is attributed.");

  const book = resolveBook(await listBooks(booksDirectory()), values.book);
  const bytes = new Uint8Array(await readFile(book.filePath));
  const sha256 = sha256Hex(bytes);
  const dirs = await listConfigDirs(config, sha256);
  const chosen = values.config ? dirs.find((item) => item.configHash === values.config) : dirs[0];
  if (!chosen) throw new OcrError("CONFIG_INVALID", `No OCR output for ${book.bookId}${values.config ? ` and config ${values.config}` : ""}. Run: npm run ingest:pilot -- --book ${book.bookId}`);

  const pdf = await openPdf(bytes);
  const info = pdf.info;
  const numPages = pdf.numPages;
  await pdf.destroy();
  const work = registryWork(book.workId);
  const calibration = await evaluateCalibration({ outputDir: chosen.dir, bookId: book.bookId, numPages, sourceSha256: sha256, configHash: chosen.configHash, language: book.language, ocrLanguages: chosen.ocrLanguages, thresholds: config.thresholds });
  const reportFile = await saveCalibrationReport(chosen.dir, calibration);

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
    config,
    calibration,
    approval: values.approve ? { note: values.approve, reviewer: values.reviewer as string, checkedOn: new Date().toISOString().slice(0, 10) } : null,
    dryRun: values["dry-run"] === true,
  });

  console.log(`${book.bookId}${values["dry-run"] ? " (dry run, nothing saved)" : ""}`);
  console.log(`  calibration verdict: ${result.verdict} (report ${reportFile})`);
  console.log(`  document ocrStatus: ${result.ocrStatus}, searchable: ${result.searchable}`);
  console.log(`  page states: ${Object.entries(result.pageStates).filter(([, count]) => count > 0).map(([state, count]) => `${state}=${count}`).join(", ") || "none"}`);
  console.log(`  chunks stored: ${result.chunks}. Indexed pages: ${result.indexedPages.length === 0 ? "none" : result.indexedPages.join(", ")}`);
  console.log(`  printed page numbers attached from a verified page map: ${result.printedPagesAttached}`);
  for (const item of result.notPromoted.slice(0, 20)) console.log(`  not promoted: page ${item.pdfPage} ${item.state}${item.reasons[0] ? ` - ${item.reasons[0]}` : ""}`);
  if (result.notPromoted.length > 20) console.log(`  ... and ${result.notPromoted.length - 20} more not promoted`);
  for (const warning of result.warnings) console.log(`  warning: ${warning}`);
}

main().catch((error: unknown) => {
  const info = describeError(error);
  console.error(`${info.code}: ${info.message}`);
  if (info.hint) console.error(info.hint);
  process.exit(info.code === "CONFIG_INVALID" ? 2 : 1);
});
