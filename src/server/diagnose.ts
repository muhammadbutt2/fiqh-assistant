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
    selectedMadhhab: input.madhhab,
    detectedLanguage: processed.detectedLanguage,
    detectionConfidence: processed.detectionConfidence,
    responseLanguageNote: "The response language is chosen separately from the question language.",
    detection: processed.detection,
    arabicQuery: processed.arabicQuery.text,
    arabicQueryMethod: processed.arabicQuery.method,
    urduQuery: processed.urduQuery.text,
    urduQueryMethod: processed.urduQuery.method,
    englishIntermediate: processed.englishIntermediate,
    generatedQueries: research.summary.generatedQueries,
    concepts: processed.concepts,
    entities: processed.entities,
    ambiguities: processed.ambiguities,
    warnings: processed.warnings,
    highStakes: processed.highStakes,
    variants: processed.variants.map(({ id, kind, language, text, method, model }) => ({ id, kind, language, text, method, model })),
    translationMethod: processed.translationMethod,
    translationProvider: processed.translationMethod === "provider"
      ? "configured"
      : processed.translationMethod === "provider_failed"
        ? "failed"
        : "unavailable",
    semanticRetrieval: "unavailable" as const,
    searchMethods: research.summary.searchMethods,
    evidenceRole: research.evidenceRole,
    approvedPoolForMadhhab: research.approvedPool,
    unapprovedCandidatesForMadhhab: research.candidatePool,
    candidateCount: approved.length,
    relevantPassagesSelected: research.summary.relevantSelected,
    candidatesRejectedForIrrelevance: research.summary.rejectedIrrelevant,
    candidatesRejectedForSourceQuality: research.summary.rejectedQuality,
    neighborsAdded: research.neighborsAdded,
    booksSearched: research.summary.booksSearched,
    websitesSearched: research.websites.searched,
    websitesSkipped: research.websites.skipped,
    websiteUrls: research.websites.hits.map((hit) => ({ url: hit.url, status: hit.sourceApprovalStatus, title: hit.title })),
    citationValidation: research.evidenceRole === "approved"
      ? "passages_retrieved"
      : research.evidenceRole === "institutional"
        ? "institutional_pages_not_a_book_ruling"
        : "no_eligible_evidence",
    sufficientEvidence: research.evidenceRole === "approved" || research.evidenceRole === "institutional",
    outcomeReason: research.summary.outcomeReason,
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
    rejectedIrrelevant: research.summary.rejectedIrrelevantSample,
    rejectedQuality: research.summary.rejectedQualitySample,
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
    note: "Approved book matches are the only passages that can support a user-facing quotation. Institutional pages are shown with a direct article link and are not quotations from a classical book. Unmeasured OCR may appear here as labelled candidates for administrators only. Semantic embeddings are not configured. Websites are searched only when local approved evidence is empty, and only for institutions with retrievalAllowed true after an admin live test.",
  };
}
