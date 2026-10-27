import { createHash } from "crypto";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { applyReview, processJob, storeUpload } from "../src/server/ingest";
import { createMemoryStore } from "../src/server/store";

const BOOKS_DIR = process.env.BOOKS_DIR || "C:\\Users\\muham\\OneDrive\\Desktop\\hanfi books";
const STORE_PATH = path.resolve(process.env.STORE_PATH || ".data/store.json");
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || ".data/storage");
const CHECKED_ON = new Date().toISOString().slice(0, 10);

function workFor(fileName: string): { workId: string; sourceClass: "primary" | "secondary"; language: string } | null {
  const lower = fileName.toLowerCase();
  if (lower.startsWith("al-qaduri")) return { workId: "quduri", sourceClass: "primary", language: "ar" };
  if (lower.startsWith("al-hadaya") || lower.startsWith("alhadayah")) return { workId: "hidayah", sourceClass: "primary", language: "ar" };
  if (lower.startsWith("fhindia")) return { workId: "hindiyyah", sourceClass: "primary", language: "ar" };
  if (lower.startsWith("bahishtizewar")) return { workId: "bahishti", sourceClass: "secondary", language: "ur" };
  return null;
}

async function main() {
  const store = createMemoryStore(STORE_PATH);
  const names = (await readdir(BOOKS_DIR)).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
  const report: Record<string, unknown>[] = [];

  for (const name of names) {
    const meta = workFor(name);
    if (!meta) {
      report.push({ file: name, outcome: "skipped_unknown_work" });
      continue;
    }
    const bytes = new Uint8Array(await readFile(path.join(BOOKS_DIR, name)));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (await store.getDocumentByHash(sha256)) {
      report.push({ file: name, sha256, outcome: "skipped_duplicate_bytes" });
      continue;
    }

    let title = name;
    let author = "";
    let volume: number | null = null;
    try {
      const { getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const info = (await pdf.getMetadata())?.info as { Title?: string; Author?: string } | undefined;
      if (typeof info?.Title === "string" && info.Title.trim()) title = info.Title.trim().slice(0, 240);
      if (typeof info?.Author === "string") author = info.Author.trim().slice(0, 240);
      const match = title.match(/ج\s*(\d+)/);
      if (match) volume = Number(match[1]);
    } catch {
      title = name;
    }

    const { document, job } = await storeUpload({
      storageDir: STORAGE_DIR,
      bytes,
      format: "pdf",
      store,
      metadata: {
        title,
        author,
        madhhab: "hanafi",
        sourceClass: meta.sourceClass,
        language: meta.language,
        format: "pdf",
        rightsStatus: "rights_review_required",
        verificationStatus: "pending",
        trustClassification: "pending",
        notes: `Local file ${name}. Kept outside git.`,
        url: null,
        fatwaNumber: null,
        volume,
        editionLabel: null,
        workId: meta.workId,
        verificationNote: "",
        methodology: "",
        checkedOn: "",
      },
    });

    await processJob(store, job.id);
    const finished = (await store.listJobs()).find((item) => item.id === job.id);
    if (finished?.status !== "completed") {
      report.push({ file: name, sha256, outcome: "extraction_failed", error: finished?.error ?? null, step: finished?.step ?? null });
      continue;
    }

    const current = (await store.listDocuments()).find((item) => item.id === document.id);
    if (!current) continue;
    const patch = applyReview(current, {
      trustClassification: "approved",
      rightsStatus: "approved_for_ingestion",
      verificationNote:
        "Approved for private local indexing on the owner's instruction. Title and author are the PDF info-dictionary fields. Not collated against a printed edition. Rights were not independently verified. Printed page numbers are not recorded.",
      methodology: "Owner instruction. unpdf text extraction, no OCR. Hanafi label comes from the owner's folder name and the work, not from a scholar's review.",
      checkedOn: CHECKED_ON,
    });
    const updated = await store.updateDocument(document.id, patch);
    const chunks = (await store.listChunks()).filter((chunk) => chunk.documentId === document.id).length;
    report.push({ file: name, sha256, title, volume, outcome: updated.searchable ? "indexed" : "not_searchable", chunks });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "INGEST_FAILED");
  process.exit(1);
});
