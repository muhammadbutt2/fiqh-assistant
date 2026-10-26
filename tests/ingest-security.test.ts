import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it } from "vitest";
import { INSTITUTIONS } from "@/data/sources";
import { postAdminUpload } from "@/server/handlers";
import { unavailableChat } from "@/server/ai";
import { chunkPages, htmlToText, processJob } from "@/server/ingest";
import { detectUpload, safeBasename } from "@/server/security";
import { checkPermittedPage } from "@/server/source-check";
import { createMemoryStore, type StoredDocument } from "@/server/store";
import { signSession } from "@/server/security";
import type { Madhhab } from "@/server/madhhab";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function document(id: string, storagePath: string, madhhab: Madhhab = "hanafi"): StoredDocument {
  return {
    id,
    title: "TEST FIXTURE upload",
    author: "Synthetic",
    madhhab,
    sourceClass: "primary",
    language: "ar",
    sha256: `hash-${id}`,
    format: "pdf",
    storagePath,
    rightsStatus: "rights_review_required",
    verificationStatus: "pending",
    trustClassification: "pending",
    ocrStatus: "pending",
    searchable: false,
    isTestFixture: false,
    notes: "",
    url: null,
    fatwaNumber: null,
    volume: null,
    editionLabel: null,
    workId: null,
    verificationNote: "",
    methodology: "",
    checkedOn: "",
  };
}

describe("uploads and ingestion", () => {
  it("rejects traversal, oversize files, and executables", () => {
    expect(() => safeBasename("..\\..\\windows\\system.ini")).toThrow("PATH_TRAVERSAL");
    expect(() => detectUpload("../secret.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46]), 100)).toThrow("PATH_TRAVERSAL");
    expect(() => detectUpload("notes.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), 4)).toThrow("FILE_TOO_LARGE");
    expect(() => detectUpload("payload.pdf", new Uint8Array([0x4d, 0x5a, 0x00, 0x00]), 100)).toThrow("INVALID_TYPE");
    expect(detectUpload("note.txt", new TextEncoder().encode("plain"), 100)).toBe("txt");
  });

  it("strips script tags and does not invent printed pages", () => {
    expect(htmlToText("<script>alert(1)</script><p>باب الصلاة</p>")).toBe("باب الصلاة");
    const chunks = chunkPages(
      [{ pdfPage: 3, text: "TEST FIXTURE الوضوء\n\nباب الصلاة", printedPage: null }],
      {
        documentId: "d",
        workId: null,
        editionId: null,
        madhhab: "hanafi",
        comparativeAppliesTo: [],
        opinionLabels: [],
        sourceClass: "primary",
        language: "ar",
        volume: null,
        ocrQuality: "not_needed",
        rightsStatus: "rights_review_required",
        verificationStatus: "pending",
        trustClassification: "pending",
        searchable: false,
        url: null,
        fatwaNumber: null,
        title: "t",
        author: "a",
        editionLabel: null,
        isTestFixture: true,
        embedding: null,
        translation: null,
      },
    );
    expect(chunks.every((chunk) => chunk.printedPageStart === null && chunk.printedPageEnd === null)).toBe(true);
    expect(chunks[0]?.pdfPageStart).toBe(3);
    expect(chunks.some((chunk) => chunk.chapterPath[0] === "باب الصلاة")).toBe(true);
  });

  it("fails an image-only PDF when Tesseract is absent", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytes = await pdf.save();
    const store = createMemoryStore();
    await store.saveDocument(document("blank", "memory.pdf"), []);
    await store.createJob({ id: "job-1", documentId: "blank", status: "queued", step: "queued", error: null, attempts: 0, events: [] });
    await processJob(store, "job-1", async () => bytes, { ocrAvailable: false });
    const job = (await store.listJobs())[0];
    expect(job?.status).toBe("failed");
    expect(job?.error).toBe("OCR_ENGINE_UNAVAILABLE");
    const saved = (await store.listDocuments())[0];
    expect(saved?.searchable).toBe(false);
    expect(saved?.ocrStatus).toBe("needs_ocr");
  });

  it("refuses a traversal name at the admin upload boundary", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "fiqh-upload-"));
    dirs.push(dir);
    const store = createMemoryStore();
    const secret = "secret";
    const cookie = `fiqh_session=${encodeURIComponent(signSession({ sub: "admin", role: "admin", exp: Date.now() + 60_000 }, secret))}`;
    const form = new FormData();
    form.set("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "..\\..\\outside.pdf", { type: "application/pdf" }));
    form.set("madhhab", "hanafi");
    const response = await postAdminUpload(new Request("http://local/api/admin/documents", { method: "POST", headers: { cookie }, body: form }), {
      store,
      chat: unavailableChat(),
      translator: { id: "u", available: () => false, translate: async () => [] },
      authSecret: secret,
      adminPassword: "password",
      storageDir: dir,
      maxUploadBytes: 1000,
      rateLimit: () => true,
    });
    expect(response.status).toBe(400);
    expect(await store.listDocuments()).toEqual([]);
  });
});

describe("institutional retrieval gate", () => {
  it("does not fetch a page while retrieval is off", async () => {
    let called = false;
    const result = await checkPermittedPage(INSTITUTIONS[0], "https://example.test/fatwa", async () => {
      called = true;
      return new Response("no");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("RETRIEVAL_NOT_PERMITTED");
    expect(called).toBe(false);
  });
});
