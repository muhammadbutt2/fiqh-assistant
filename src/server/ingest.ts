import { createHash, randomUUID } from "crypto";
import { readFile, mkdir, writeFile } from "fs/promises";
import { spawnSync } from "child_process";
import JSZip from "jszip";
import type { Madhhab } from "@/server/madhhab";
import { safeStoragePath } from "@/server/security";
import type { JobRecord, Store, StoredDocument } from "@/server/store";
import { normalizeForSearch } from "@/server/text";
import type { StoredChunk } from "@/server/types";

export type ExtractedPage = { pdfPage: number; text: string; printedPage: number | null };

export async function extractPdf(bytes: Uint8Array): Promise<{ pages: ExtractedPage[]; needsOcr: boolean }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const extracted = await extractText(pdf, { mergePages: false });
  const texts = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  const pages = texts.map((text, index) => ({ pdfPage: index + 1, text: text ?? "", printedPage: null }));
  const characters = pages.reduce((sum, page) => sum + page.text.trim().length, 0);
  return { pages, needsOcr: pages.length === 0 || characters < pages.length * 20 };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractEpub(bytes: Uint8Array): Promise<ExtractedPage[]> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((name) => /\.(xhtml|html|htm)$/i.test(name)).sort();
  const pages: ExtractedPage[] = [];
  let uncompressed = 0;
  for (const name of names) {
    const file = zip.files[name];
    if (!file || file.dir) continue;
    const text = await file.async("string");
    uncompressed += text.length;
    if (uncompressed > 20_000_000) throw new Error("FILE_TOO_LARGE");
    pages.push({ pdfPage: pages.length + 1, text: htmlToText(text), printedPage: null });
  }
  return pages;
}

export function chunkPages(pages: ExtractedPage[], base: Omit<StoredChunk, "id" | "originalText" | "normalizedText" | "pdfPageStart" | "pdfPageEnd" | "printedPageStart" | "printedPageEnd" | "chapterPath">): StoredChunk[] {
  const chunks: StoredChunk[] = [];
  let chapter: string[] = [];
  for (const page of pages) {
    const blocks = page.text.split(/\n\s*\n|\n/).map((block) => block.trim()).filter(Boolean);
    let buffer = "";
    const flush = () => {
      if (!buffer.trim()) return;
      chunks.push({
        ...base,
        id: randomUUID(),
        originalText: buffer.trim(),
        normalizedText: normalizeForSearch(buffer),
        pdfPageStart: page.pdfPage,
        pdfPageEnd: page.pdfPage,
        printedPageStart: page.printedPage,
        printedPageEnd: page.printedPage,
        chapterPath: [...chapter],
      });
      buffer = "";
    };
    for (const block of blocks.length > 0 ? blocks : []) {
      if (/^(باب|فصل|كتاب|chapter\b|bab\b|fasl\b)/i.test(block) && block.length < 160) chapter = [block];
      if ((buffer + " " + block).length > 900) flush();
      buffer = `${buffer} ${block}`.trim();
    }
    flush();
  }
  return chunks;
}

export function tesseractAvailable(command = process.env.TESSERACT_CMD || "tesseract"): boolean {
  if (!command) return false;
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], { encoding: "utf8" });
  return result.status === 0;
}

export async function processQueuedJobs(store: Store): Promise<void> {
  for (const job of await store.listJobs()) {
    if (job.status === "queued") await processJob(store, job.id);
  }
}

export async function processJob(
  store: Store,
  jobId: string,
  read: (file: string) => Promise<Uint8Array> = (file) => readFile(file),
  options?: { ocrAvailable?: boolean },
): Promise<void> {
  const job = (await store.listJobs()).find((item) => item.id === jobId);
  if (!job || !job.documentId) return;
  const document = (await store.listDocuments()).find((item) => item.id === job.documentId);
  if (!document) {
    await store.updateJob(jobId, { status: "failed", error: "DOCUMENT_MISSING", step: "verify" });
    return;
  }
  const note = async (step: string, message: string) => {
    const current = (await store.listJobs()).find((item) => item.id === jobId) as JobRecord;
    await store.updateJob(jobId, { step, status: "running", events: [...current.events, { at: new Date().toISOString(), level: "info", message }] });
  };
  try {
    await note("extract", "Reading the stored file.");
    const bytes = await read(document.storagePath);
    let pages: ExtractedPage[] = [];
    let needsOcr = false;
    if (document.format === "pdf") {
      const extracted = await extractPdf(bytes);
      pages = extracted.pages;
      needsOcr = extracted.needsOcr;
    } else if (document.format === "epub") pages = await extractEpub(bytes);
    else if (document.format === "html") pages = [{ pdfPage: 1, text: htmlToText(Buffer.from(bytes).toString("utf8")), printedPage: null }];
    else pages = [{ pdfPage: 1, text: Buffer.from(bytes).toString("utf8"), printedPage: null }];

    if (needsOcr) {
      const ocrAvailable = options?.ocrAvailable ?? tesseractAvailable();
      if (!ocrAvailable) {
        await store.updateDocument(document.id, { ocrStatus: "needs_ocr", searchable: false });
        await store.updateJob(jobId, { status: "failed", step: "ocr", error: "OCR_ENGINE_UNAVAILABLE" });
        return;
      }
      await store.updateDocument(document.id, { ocrStatus: "engine_present_unmeasured", searchable: false });
      await store.updateJob(jobId, { status: "failed", step: "ocr", error: "OCR_NOT_RUN_ACCURACY_UNMEASURED" });
      return;
    }

    await note("chunk", "Segmenting text. Printed page numbers are left empty unless a page map was supplied.");
    const chunks = chunkPages(pages, {
      documentId: document.id,
      workId: document.workId,
      editionId: null,
      madhhab: document.madhhab,
      comparativeAppliesTo: [],
      opinionLabels: [],
      sourceClass: document.sourceClass,
      language: document.language,
      volume: document.volume,
      ocrQuality: "not_needed",
      rightsStatus: document.rightsStatus,
      verificationStatus: document.verificationStatus,
      trustClassification: document.trustClassification,
      searchable: false,
      url: document.url,
      fatwaNumber: document.fatwaNumber,
      title: document.title,
      author: document.author,
      editionLabel: document.editionLabel,
      isTestFixture: document.isTestFixture,
      embedding: null,
      translation: null,
    });
    await store.saveDocument({ ...document, ocrStatus: "not_needed", searchable: false }, chunks);
    await store.updateJob(jobId, { status: "completed", step: "pending_review", error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INGESTION_FAILED";
    await store.updateJob(jobId, { status: "failed", step: "extract", error: message === "OCR_ENGINE_UNAVAILABLE" ? message : "INGESTION_FAILED" });
  }
}

export async function storeUpload(options: {
  storageDir: string;
  bytes: Uint8Array;
  format: string;
  metadata: Omit<StoredDocument, "id" | "sha256" | "storagePath" | "searchable" | "ocrStatus" | "isTestFixture">;
  store: Store;
}): Promise<{ document: StoredDocument; job: JobRecord }> {
  const sha256 = createHash("sha256").update(options.bytes).digest("hex");
  if (await options.store.getDocumentByHash(sha256)) throw new Error("DUPLICATE_FILE");
  const id = randomUUID();
  await mkdir(options.storageDir, { recursive: true });
  const storagePath = safeStoragePath(options.storageDir, `${id}.${options.format === "html" ? "html" : options.format}`);
  await writeFile(storagePath, options.bytes);
  const document: StoredDocument = {
    ...options.metadata,
    id,
    sha256,
    storagePath,
    searchable: false,
    ocrStatus: "pending",
    isTestFixture: false,
  };
  const job: JobRecord = { id: randomUUID(), documentId: id, status: "queued", step: "queued", error: null, attempts: 0, events: [] };
  await options.store.saveDocument(document, []);
  await options.store.createJob(job);
  return { document, job };
}

export function applyReview(document: StoredDocument, patch: Partial<StoredDocument>): Partial<StoredDocument> {
  const next = { ...document, ...patch };
  if (next.trustClassification === "approved") {
    if (!next.verificationNote || !next.methodology || !next.checkedOn) throw new Error("VERIFICATION_REQUIRED");
    next.verificationStatus = "verified";
  }
  const searchable = next.trustClassification === "approved"
    && next.verificationStatus === "verified"
    && next.rightsStatus === "approved_for_ingestion"
    && next.ocrStatus !== "needs_ocr"
    && next.ocrStatus !== "poor";
  return { ...patch, verificationStatus: next.verificationStatus, searchable };
}

export type UploadMetadata = {
  title: string;
  author: string;
  madhhab: Madhhab;
  sourceClass: StoredChunk["sourceClass"];
  language: string;
  format: string;
  rightsStatus: StoredChunk["rightsStatus"];
  verificationStatus: StoredChunk["verificationStatus"];
  trustClassification: StoredChunk["trustClassification"];
  notes: string;
  url: string | null;
  fatwaNumber: string | null;
  volume: number | null;
  editionLabel: string | null;
  workId: string | null;
  verificationNote: string;
  methodology: string;
  checkedOn: string;
};
