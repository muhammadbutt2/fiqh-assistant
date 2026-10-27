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
    citationValidation: research.evidenceRole === "approved"
      ? "passages_retrieved"
      : research.evidenceRole === "institutional"
        ? "institutional_pages_not_a_book_ruling"
        : research.evidenceRole === "candidate"
          ? "candidate_only_not_a_ruling"
          : "no_passage",
    sufficientEvidence: research.evidenceRole === "approved",
    websiteHits: research.websites.hits.map((hit) => ({
      url: hit.url,
      title: hit.title,
      institution: hit.institutionName,
      snippetOnly: hit.snippetOnly,
      language: hit.language,
      retrievedAt: hit.retrievedAt,
      excerpt: hit.excerpt.slice(0, 240),
      sourceApprovalStatus: hit.sourceApprovalStatus,
    })),
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
    note: "Approved book matches are the only passages that can support a ruling. Institutional pages are shown with a direct link and are not quotations from a classical book. Unmeasured OCR may appear as labelled candidates. Semantic embeddings are not configured. Websites are searched only when local approved evidence is empty, and only for institutions with retrievalAllowed true after an admin live test.",
  };
}
