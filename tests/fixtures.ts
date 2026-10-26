import { normalizeForSearch } from "@/server/text";
import type { StoredChunk } from "@/server/types";

export function fixture(partial: Partial<StoredChunk> & Pick<StoredChunk, "id" | "madhhab" | "originalText">): StoredChunk {
  const originalText = partial.originalText;
  return {
    documentId: `doc-${partial.id}`,
    workId: null,
    editionId: null,
    comparativeAppliesTo: [],
    opinionLabels: [],
    sourceClass: "primary",
    language: "ar",
    volume: null,
    printedPageStart: null,
    printedPageEnd: null,
    pdfPageStart: 1,
    pdfPageEnd: 1,
    chapterPath: ["TEST FIXTURE"],
    translation: null,
    ocrQuality: "not_needed",
    rightsStatus: "approved_for_ingestion",
    verificationStatus: "verified",
    trustClassification: "approved",
    searchable: true,
    url: null,
    fatwaNumber: null,
    title: "TEST FIXTURE passage",
    author: "Synthetic author",
    editionLabel: null,
    isTestFixture: true,
    embedding: null,
    ...partial,
    originalText,
    normalizedText: partial.normalizedText ?? normalizeForSearch(originalText),
  };
}
