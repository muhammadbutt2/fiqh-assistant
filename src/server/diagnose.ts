import type { Madhhab } from "@/server/madhhab";
import { processQuestion } from "@/server/query";
import { chunkAllowed, selectChunks } from "@/server/retrieve";
import type { StoredChunk } from "@/server/types";

export function diagnoseRetrieval(input: { question: string; madhhab: Madhhab; chunks: StoredChunk[] }) {
  const processed = processQuestion(input.question);
  const selected = selectChunks({
    chunks: input.chunks,
    madhhab: input.madhhab,
    variants: processed.variants,
    allowTestFixtures: false,
    limit: 10,
  });
  const approvedPool = input.chunks.filter((chunk) => chunkAllowed(chunk, input.madhhab, false)).length;
  const candidatePool = input.chunks.filter((chunk) => !chunkAllowed(chunk, input.madhhab, false) && chunk.madhhab === input.madhhab).length;
  return {
    questionOriginal: input.question,
    detectedLanguage: processed.detectedLanguage,
    detectionConfidence: processed.detectionConfidence,
    detection: processed.detection,
    arabicQuery: processed.arabicQuery.text,
    arabicQueryMethod: processed.arabicQuery.method,
    urduQuery: processed.urduQuery.text,
    urduQueryMethod: processed.urduQuery.method,
    englishIntermediate: processed.englishIntermediate,
    concepts: processed.concepts,
    entities: processed.entities,
    ambiguities: processed.ambiguities,
    warnings: processed.warnings,
    highStakes: processed.highStakes,
    variants: processed.variants.map(({ id, kind, language, text, method, model }) => ({ id, kind, language, text, method, model })),
    translationMethod: processed.translationMethod,
    semanticRetrieval: "unavailable" as const,
    searchMethods: ["original question", "normalized text", "terminology registry (Arabic and Urdu)", "lexical overlap", "madhhab filter", "approval gates"],
    approvedPoolForMadhhab: approvedPool,
    unapprovedCandidatesForMadhhab: candidatePool,
    candidateCount: selected.length,
    candidates: selected.map((chunk) => ({
      sourceId: chunk.id,
      title: chunk.title,
      author: chunk.author,
      madhhab: chunk.madhhab,
      language: chunk.language,
      score: Number(chunk.retrievalScore.toFixed(4)),
      semanticScore: null,
      verificationStatus: chunk.verificationStatus,
      ocrQuality: chunk.ocrQuality,
      sourceClass: chunk.sourceClass,
      pdfPage: chunk.pdfPageStart,
      printedPage: chunk.printedPageStart,
      excerpt: chunk.originalText.slice(0, 180),
    })),
    note: "Only approved searchable passages are candidates. Unmeasured OCR is excluded and counted separately as unapproved candidates. Semantic embeddings are not configured, so there is no cross-language vector score. Arabic and Urdu queries come from the terminology registry, not from a translation of the whole sentence, unless a translation provider is configured on the ask path.",
  };
}
