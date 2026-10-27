import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { applyReview, processJob, storeUpload } from "../src/server/ingest";
import { createMemoryStore } from "../src/server/store";

const STORE_PATH = path.resolve(process.env.STORE_PATH || ".data/store.json");
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || ".data/storage");
const TEXT_PATH = path.resolve(process.env.OPEN_TEXT || ".data/open/minhaj-talibin.txt");

async function main() {
  const store = createMemoryStore(STORE_PATH);
  const bytes = new Uint8Array(await readFile(TEXT_PATH));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (await store.getDocumentByHash(sha256)) {
    console.log(JSON.stringify({ outcome: "skipped_duplicate_bytes", sha256 }));
    return;
  }
  const { document, job } = await storeUpload({
    storageDir: STORAGE_DIR,
    bytes,
    format: "txt",
    store,
    metadata: {
      title: "Minhaj al-Talibin wa Umdat al-Muftin",
      author: "al-Nawawi",
      madhhab: "shafii",
      sourceClass: "primary",
      language: "ar",
      format: "txt",
      rightsStatus: "rights_review_required",
      verificationStatus: "pending",
      trustClassification: "pending",
      notes: "archive.org item minhaj_talibin. Uploader licence field is the Public Domain Mark. Text is archive.org's OCR (djvu.txt) of a 2005 edition. Kept outside git.",
      url: "https://archive.org/details/minhaj_talibin",
      fatwaNumber: null,
      volume: null,
      editionLabel: "archive.org OCR of a 2005 printed edition",
      workId: "minhaj",
      verificationNote: "",
      methodology: "",
      checkedOn: "",
    },
  });
  await processJob(store, job.id);
  const finished = (await store.listJobs()).find((item) => item.id === job.id);
  if (finished?.status !== "completed") {
    console.log(JSON.stringify({ outcome: "extraction_failed", error: finished?.error ?? null }));
    return;
  }
  const current = (await store.listDocuments()).find((item) => item.id === document.id);
  if (!current) return;
  const patch = applyReview(current, {
    trustClassification: "approved",
    rightsStatus: "approved_for_ingestion",
    verificationNote:
      "Approved for private local indexing on the owner's instruction. The only rights evidence is the archive.org uploader's Public Domain Mark; the 2005 edition's own rights were not checked. The text is archive.org OCR. Its accuracy was not measured and it includes editor material and footnotes. Not collated against a print edition.",
    methodology: "Owner instruction. archive.org licence field read through the metadata API. The djvu.txt was downloaded unchanged. Arabic letter ratio and common-word counts were checked, and no word-level accuracy was measured.",
    checkedOn: new Date().toISOString().slice(0, 10),
  });
  const updated = await store.updateDocument(document.id, patch);
  const chunks = (await store.listChunks()).filter((chunk) => chunk.documentId === document.id).length;
  console.log(JSON.stringify({ outcome: updated.searchable ? "indexed" : "not_searchable", chunks, sha256 }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "INGEST_FAILED");
  process.exit(1);
});
