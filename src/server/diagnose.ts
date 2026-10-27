import type { Madhhab } from "@/server/madhhab";
import { selectChunks } from "@/server/retrieve";
import { buildVariants, detectLanguage } from "@/server/text";
import type { StoredChunk } from "@/server/types";

export function diagnoseRetrieval(input: { question: string; madhhab: Madhhab; chunks: StoredChunk[] }) {
  const detection = detectLanguage(input.question);
  const built = buildVariants(input.question, detection);
  const selected = selectChunks({
    chunks: input.chunks,
    madhhab: input.madhhab,
    variants: built.variants,
    allowTestFixtures: false,
    limit: 10,
  });
  return {
    questionOriginal: input.question,
    detectedLanguage: detection.language,
    detection,
    arabicQuery: built.variants.find((item) => item.id === "glossary-ar")?.text ?? null,
    urduQuery: built.variants.find((item) => item.id === "glossary-ur")?.text ?? null,
    variants: built.variants.map(({ id, kind, language, text, method, model }) => ({ id, kind, language, text, method, model })),
    translationMethod: built.method,
    semanticRetrieval: "unavailable" as const,
    searchMethods: ["original question", "normalized text", "terminology aliases", "lexical overlap"],
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
    note: "Only approved searchable passages are candidates. Unmeasured OCR is excluded. Semantic embeddings are not configured, so there is no cross-language vector score. Arabic and Urdu queries come from the terminology list, not from a translation of the whole sentence, unless a translation provider is configured on the ask path.",
  };
}
