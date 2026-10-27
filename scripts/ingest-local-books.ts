import { readFile } from "fs/promises";
import path from "path";
import { parseArgs } from "util";
import { describeBook, listBooks, resolveBook, type BookMeta } from "../src/server/ocr/books";
import { loadOcrConfig } from "../src/server/ocr/config";
import { OcrError, describeError } from "../src/server/ocr/errors";
import { parsePageList, runPipeline, saveReport, selectPilotPages } from "../src/server/ocr/pipeline";
import { booksDirectory, defaultDeps, loadProjectEnv } from "../src/server/ocr/runtime";

const USAGE = `Usage (run through npm so the mode is fixed):
  npm run ingest:pilot -- --book <id> [--limit 5 | --pages 10,40-42] [--ocr-lang ara] [--dry-run] [--preview 300] [--report <file.json>]
  npm run ingest:full  -- --book <id> --confirm-full [--ocr-lang ara]
  npm run ingest:full  -- --all-books --confirm-full

Book ids come from the files in BOOKS_DIR, for example al-qaduri, alhadayah3, fhindia2, bahishti-zewar.
Nothing here makes text searchable. After OCR: npm run ocr:calibrate, then npm run ocr:index.`;

async function main() {
  loadProjectEnv();
  const { values } = parseArgs({
    options: {
      mode: { type: "string" },
      book: { type: "string" },
      file: { type: "string" },
      "all-books": { type: "boolean", default: false },
      limit: { type: "string" },
      pages: { type: "string" },
      "ocr-lang": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      preview: { type: "string" },
      report: { type: "string" },
      "no-retry-failed": { type: "boolean", default: false },
      "confirm-full": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (values.help || (values.mode !== "pilot" && values.mode !== "full")) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 2);
  }
  const mode = values.mode;
  const config = loadOcrConfig();
  const dryRun = values["dry-run"] === true;

  let books: BookMeta[];
  if (values.file) {
    books = [describeBook(path.basename(values.file), path.dirname(path.resolve(values.file)), { ocrLanguages: values["ocr-lang"] })];
  } else {
    const all = await listBooks(booksDirectory());
    if (values["all-books"]) {
      if (mode !== "full") throw new OcrError("CONFIG_INVALID", "--all-books is only allowed with ingest:full. A pilot works on one book.");
      books = all;
    } else if (values.book) {
      books = [resolveBook(all, values.book)];
    } else {
      throw new OcrError("CONFIG_INVALID", "Choose a book with --book <id>. Nothing was processed.", USAGE);
    }
    if (values["ocr-lang"]) books = books.map((book) => describeBook(book.fileName, path.dirname(book.filePath), { ocrLanguages: values["ocr-lang"] }));
  }

  if (mode === "full" && !values["confirm-full"] && !dryRun) {
    throw new OcrError(
      "CONFIG_INVALID",
      "Full ingestion can take hours. Add --confirm-full to start it. Run ingest:pilot first and complete calibration.",
      "Add --dry-run to see how many pages would need OCR without running anything.",
    );
  }
  if (mode === "pilot" && values.pages && values.limit) throw new OcrError("CONFIG_INVALID", "Use either --pages or --limit, not both.");

  const controller = new AbortController();
  process.on("SIGINT", () => {
    if (controller.signal.aborted) process.exit(130);
    console.error("\nInterrupt received. Finishing pages already in flight, then stopping. Run the same command to resume.");
    controller.abort();
  });

  const deps = defaultDeps(config);
  const previewChars = values.preview ? Math.max(0, Math.min(5000, Number(values.preview) || 0)) : 0;
  const results: unknown[] = [];

  for (const book of books) {
    const bytes = new Uint8Array(await readFile(book.filePath));
    const probe = await deps.openPdf(bytes);
    const numPages = probe.numPages;
    await probe.destroy();

    let pages: number[];
    if (mode === "full") pages = Array.from({ length: numPages }, (_, index) => index + 1);
    else {
      const limit = values.limit ? Number(values.limit) : 5;
      if (!Number.isInteger(limit) || limit < 1) throw new OcrError("CONFIG_INVALID", "--limit must be a whole number of at least 1.");
      if (limit > config.pilotMaxPages) {
        throw new OcrError("CONFIG_INVALID", `A pilot is capped at ${config.pilotMaxPages} pages (OCR_PILOT_MAX_PAGES). Use ingest:full for more.`);
      }
      pages = values.pages ? parsePageList(values.pages, numPages) : selectPilotPages(numPages, limit);
      if (pages.length > config.pilotMaxPages) {
        throw new OcrError("CONFIG_INVALID", `That page list has ${pages.length} pages. A pilot is capped at ${config.pilotMaxPages}. Use ingest:full for more.`);
      }
    }

    console.log(`\n${book.bookId}: ${book.fileName}`);
    console.log(`  mode ${mode}${dryRun ? " (dry run)" : ""}, ${pages.length} of ${numPages} pages, OCR language ${book.ocrLanguages} (${book.ocrLanguageReason})`);
    let lastPrint = 0;
    const report = await runPipeline({
      book,
      bytes,
      config,
      deps,
      options: {
        mode,
        pages,
        dryRun,
        ocrLanguages: book.ocrLanguages,
        language: book.language,
        retryFailed: values["no-retry-failed"] !== true,
        previewChars,
        signal: controller.signal,
        onProgress: (progress) => {
          const now = Date.now();
          if (now - lastPrint < 2000 && progress.remaining > 0) return;
          lastPrint = now;
          const eta = progress.etaMs === null ? "unknown" : `${Math.round(progress.etaMs / 1000)} s`;
          console.log(`  ${progress.done}/${progress.total} done, ${progress.remaining} remaining, ${progress.failed} failed, ${Math.round(progress.elapsedMs / 1000)} s elapsed, ETA ${eta}`);
        },
      },
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportFile = values.report
      ? path.resolve(values.report)
      : report.outputDir
        ? path.join(report.outputDir, "reports", `${mode}-${stamp}.json`)
        : null;
    if (reportFile) await saveReport(report, reportFile);

    console.log(`  embedded text used: ${report.counts.textExtracted}, OCR completed: ${report.counts.ocrCompleted}, OCR pending: ${report.counts.ocrPending}, failed: ${report.counts.failed}, reused from checkpoint: ${report.counts.resumedFromCheckpoint}${dryRun ? `, would need OCR: ${report.counts.wouldOcr}` : ""}`);
    for (const note of report.notes) console.log(`  note: ${note}`);
    if (report.engineError) {
      console.log(`  OCR engine problem [${report.engineError.code}]: ${report.engineError.message}`);
      if (report.engineError.hint) console.log(report.engineError.hint.split("\n").map((line) => `    ${line}`).join("\n"));
    }
    if (reportFile) console.log(`  report: ${reportFile} (and .md)`);
    for (const page of report.pages) {
      if (page.preview) console.log(`  --- page ${page.pdfPage} (${page.method ?? page.stage}) ---\n${page.preview}`);
    }
    results.push({ bookId: book.bookId, counts: report.counts, configHash: report.configHash, interrupted: report.interrupted });
    if (controller.signal.aborted) break;
  }

  if (!dryRun) {
    console.log("\nOCR text from this run is unmeasured and is not searchable.");
    console.log("Next: npm run ocr:calibrate -- select --book <id>");
  }
  if (results.length === 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const info = describeError(error);
  console.error(`${info.code}: ${info.message}`);
  if (info.hint) console.error(info.hint);
  process.exit(info.code === "CONFIG_INVALID" ? 2 : 1);
});
