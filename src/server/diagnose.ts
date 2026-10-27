import { INSTITUTIONS, type Institution } from "@/data/sources";
import type { Madhhab } from "@/server/madhhab";
import { processQuestion } from "@/server/query";
import { researchQuestion } from "@/server/research";
import { explainRejection, selectCandidateChunks, selectChunks } from "@/server/retrieve";
import type { StoredChunk } from "@/server/types";

export async function diagnoseRetrieval(input: {
  question: string;
  madhhab: Madhhab;
  chunks: StoredChunk[];
  institutions?: Institution[];
}) {
  const processed = processQuestion(input.question);
  const research = await researchQuestion({
    chunks: input.chunks,
    madhhab: input.madhhab,
    variants: processed.variants,
    allowTestFixtures: false,
    institutions: input.institutions ?? INSTITUTIONS,
  });
  const approved = selectChunks({
    chunks: input.chunks,
    madhhab: input.madhhab,
    variants: processed.variants,
    allowTestFixtures: false,
    limit: 10,
  });
  const unapprovedMatches = selectCandidateChunks({
    chunks: input.chunks,
    madhhab: input.madhhab,
    variants: processed.variants,
    allowTestFixtures: false,
    limit: 10,
  });
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
    searchMethods: research.summary.searchMethods,
    evidenceRole: research.evidenceRole,
    approvedPoolForMadhhab: research.approvedPool,
    unapprovedCandidatesForMadhhab: research.candidatePool,
    candidateCount: approved.length,
    neighborsAdded: research.neighborsAdded,
    websitesSearched: research.websites.searched,
    websitesSkipped: research.websites.skipped,
    citationValidation: research.evidenceRole === "approved" ? "passages_retrieved" : research.evidenceRole === "candidate" ? "candidate_only_not_a_ruling" : "no_passage",
    sufficientEvidence: research.evidenceRole === "approved",
    candidates: approved.map((chunk) => ({
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
      evidenceRole: "approved" as const,
    })),
    unapprovedMatches: unapprovedMatches.map((chunk) => ({
      sourceId: chunk.id,
      title: chunk.title,
      author: chunk.author,
      madhhab: chunk.madhhab,
      language: chunk.language,
      score: Number(chunk.retrievalScore.toFixed(4)),
      verificationStatus: chunk.verificationStatus,
      ocrQuality: chunk.ocrQuality,
      sourceClass: chunk.sourceClass,
      pdfPage: chunk.pdfPageStart,
      excerpt: chunk.originalText.slice(0, 180),
      rejectedFromApprovedEvidence: explainRejection(chunk, input.madhhab, false),
      evidenceRole: "candidate" as const,
    })),
    note: "Approved matches are the only passages that can support a ruling. Unmeasured OCR and pending-review text can appear as labelled candidates so a single match is not hidden. They are not approved evidence. Semantic embeddings are not configured. Arabic and Urdu queries come from the terminology registry unless a translation provider is configured. Institutional websites are skipped while retrievalAllowed is false.",
  };
}
