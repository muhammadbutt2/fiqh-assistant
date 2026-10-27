import type { Institution } from "@/data/sources";
import type { Madhhab } from "@/server/madhhab";
import {
  chunkAllowed,
  chunkDiscoverable,
  collectRejectedCandidates,
  expandNeighbors,
  selectCandidateChunks,
  selectChunks,
  type RejectedPassage,
  type SelectedChunk,
} from "@/server/retrieve";
import type { QueryVariant, ResearchSummary, StoredChunk } from "@/server/types";
import { searchApprovedWebsites, websiteHitsToChunks, type WebsiteSearchReport } from "@/server/websites";

export type ResearchResult = {
  evidenceRole: ResearchSummary["evidenceRole"];
  selected: SelectedChunk[];
  approved: SelectedChunk[];
  candidates: SelectedChunk[];
  institutional: SelectedChunk[];
  neighborsAdded: number;
  approvedPool: number;
  candidatePool: number;
  websites: WebsiteSearchReport;
  rejectedIrrelevant: RejectedPassage[];
  rejectedQuality: RejectedPassage[];
  summary: ResearchSummary;
};

function uniqueBooks(chunks: StoredChunk[], madhhab: Madhhab, allowTestFixtures: boolean): ResearchSummary["booksSearched"] {
  const seen = new Set<string>();
  const books: ResearchSummary["booksSearched"] = [];
  for (const chunk of chunks) {
    if (seen.has(chunk.documentId)) continue;
    seen.add(chunk.documentId);
    const approved = chunkAllowed(chunk, madhhab, allowTestFixtures) || chunks.some((item) => item.documentId === chunk.documentId && chunkAllowed(item, madhhab, allowTestFixtures));
    books.push({
      documentId: chunk.documentId,
      title: chunk.title,
      searchable: chunk.searchable || chunks.some((item) => item.documentId === chunk.documentId && item.searchable),
      approved,
    });
  }
  return books;
}

export async function researchQuestion(input: {
  chunks: StoredChunk[];
  madhhab: Madhhab;
  variants: QueryVariant[];
  allowTestFixtures: boolean;
  institutions: Institution[];
  searchWebsites?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<ResearchResult> {
  const question = input.variants.find((variant) => variant.kind === "original")?.text ?? input.variants.map((variant) => variant.text).join(" ");
  const approvedPool = input.chunks.filter((chunk) => chunkAllowed(chunk, input.madhhab, input.allowTestFixtures));
  const candidatePool = input.chunks.filter((chunk) => chunkDiscoverable(chunk, input.madhhab, input.allowTestFixtures) && !chunkAllowed(chunk, input.madhhab, input.allowTestFixtures));

  const ranked = collectRejectedCandidates({
    chunks: input.chunks,
    madhhab: input.madhhab,
    variants: input.variants,
    allowTestFixtures: input.allowTestFixtures,
    limit: 8,
  });

  let approved = selectChunks({
    chunks: input.chunks,
    madhhab: input.madhhab,
    variants: input.variants,
    allowTestFixtures: input.allowTestFixtures,
    limit: 8,
  });
  const approvedBeforeNeighbors = approved.length;
  approved = expandNeighbors(approved, approvedPool, 1, question);

  let candidates = selectCandidateChunks({
    chunks: input.chunks,
    madhhab: input.madhhab,
    variants: input.variants,
    allowTestFixtures: input.allowTestFixtures,
    limit: 8,
  });
  const candidatesBeforeNeighbors = candidates.length;
  candidates = expandNeighbors(candidates, candidatePool, 1, question);

  const glossaryEn = input.variants.filter((variant) => variant.kind === "glossary" && variant.language === "en");
  const mentioned = glossaryEn.flatMap((variant) => variant.text.split(/\s+/)).filter((token) => token.length >= 4 && question.toLowerCase().includes(token.toLowerCase()));
  const queries = [
    question,
    ...mentioned,
    ...glossaryEn.map((variant) => variant.text),
    ...input.variants
      .filter((variant) => variant.kind === "original" || variant.kind === "glossary" || variant.kind === "translation")
      .map((variant) => variant.text),
  ].map((item) => item.trim()).filter(Boolean);

  const shouldSearchWebsites = input.searchWebsites !== false && approvedBeforeNeighbors === 0;
  const websites = shouldSearchWebsites
    ? await searchApprovedWebsites({
      institutions: input.institutions,
      madhhab: input.madhhab,
      query: question,
      queries,
      fetchImpl: input.fetchImpl,
      limit: 3,
      fetchPages: true,
      delayMs: input.fetchImpl ? 0 : 350,
    })
    : {
      searched: [],
      skipped: input.institutions.map((item) => ({
        id: item.id,
        domain: item.domain,
        reason: approvedBeforeNeighbors > 0
          ? "Local approved book evidence was sufficient, so websites were not searched."
          : input.searchWebsites === false
            ? "Website search was not requested."
            : "Website search was not requested.",
      })),
      hits: [],
      queries,
      rejectedIrrelevant: [],
    };

  const institutional = websiteHitsToChunks(websites.hits).map((chunk) => ({ ...chunk, retrievalScore: 1, semanticScore: null as number | null }));

  const evidenceRole: ResearchSummary["evidenceRole"] = approved.length > 0
    ? "approved"
    : institutional.length > 0
      ? "institutional"
      : "none";
  const selected = evidenceRole === "approved" ? approved : evidenceRole === "institutional" ? institutional : [];
  const neighborsAdded = evidenceRole === "approved" ? approved.length - approvedBeforeNeighbors : 0;

  const searchMethods = [
    "original question",
    "normalized text",
    "terminology registry (Arabic and Urdu)",
    "topic-concept ranking",
    "madhhab filter",
    "approval gates",
  ];
  if (approvedBeforeNeighbors > 0) searchMethods.push("neighbouring PDF pages, kept only when still on-topic");
  if (websites.searched.length > 0) searchMethods.push("approved-website OpenSearch/RSS and path-restricted page fetch");
  searchMethods.push("candidate discovery kept in the administrator trace only");

  const outcomeReason = evidenceRole === "approved"
    ? `${approvedBeforeNeighbors} approved on-topic passage(s) from indexed books.`
    : evidenceRole === "institutional"
      ? `${institutional.length} relevant article(s) from an approved institutional website.`
      : candidatesBeforeNeighbors > 0
        ? "Matching pages were found only in unmeasured or unapproved text, so no user-facing ruling is produced."
        : ranked.rejectedIrrelevant.length > 0
          ? "Indexed passages matched keywords but were rejected as off-topic."
          : "No matching passage was found in the approved index for this school.";

  const summary: ResearchSummary = {
    evidenceRole,
    approvedMatches: approvedBeforeNeighbors,
    candidateMatches: candidatesBeforeNeighbors,
    neighborsAdded,
    approvedPool: approvedPool.length,
    candidatePool: candidatePool.length,
    websitesSearched: websites.searched.length,
    websiteHits: institutional.length,
    websitesSkipped: websites.skipped.map((item) => ({ id: item.id, reason: item.reason })),
    websitesSearchedDetail: websites.searched,
    searchMethods,
    relevantSelected: selected.length,
    rejectedIrrelevant: ranked.rejectedIrrelevant.length + websites.rejectedIrrelevant.length,
    rejectedQuality: ranked.rejectedQuality.length,
    rejectedIrrelevantSample: ranked.rejectedIrrelevant.slice(0, 8).map((item) => ({ sourceId: item.sourceId, title: item.title, reason: item.reason })),
    rejectedQualitySample: ranked.rejectedQuality.slice(0, 8).map((item) => ({ sourceId: item.sourceId, title: item.title, reason: item.reason })),
    booksSearched: uniqueBooks(input.chunks, input.madhhab, input.allowTestFixtures),
    generatedQueries: {
      ar: input.variants.find((variant) => variant.language === "ar" && (variant.kind === "glossary" || variant.kind === "translation" || variant.kind === "original"))?.text ?? null,
      ur: input.variants.find((variant) => variant.language === "ur" && (variant.kind === "glossary" || variant.kind === "translation" || variant.kind === "original"))?.text ?? null,
    },
    outcomeReason,
  };

  return {
    evidenceRole,
    selected,
    approved,
    candidates,
    institutional,
    neighborsAdded,
    approvedPool: approvedPool.length,
    candidatePool: candidatePool.length,
    websites,
    rejectedIrrelevant: ranked.rejectedIrrelevant,
    rejectedQuality: ranked.rejectedQuality,
    summary,
  };
}
