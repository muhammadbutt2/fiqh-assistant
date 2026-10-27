import type { Institution } from "@/data/sources";
import type { Madhhab } from "@/server/madhhab";
import {
  chunkAllowed,
  chunkDiscoverable,
  expandNeighbors,
  selectCandidateChunks,
  selectChunks,
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
  summary: ResearchSummary;
};

export async function researchQuestion(input: {
  chunks: StoredChunk[];
  madhhab: Madhhab;
  variants: QueryVariant[];
  allowTestFixtures: boolean;
  institutions: Institution[];
  searchWebsites?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<ResearchResult> {
  const approvedPool = input.chunks.filter((chunk) => chunkAllowed(chunk, input.madhhab, input.allowTestFixtures));
  const candidatePool = input.chunks.filter((chunk) => chunkDiscoverable(chunk, input.madhhab, input.allowTestFixtures) && !chunkAllowed(chunk, input.madhhab, input.allowTestFixtures));

  let approved = selectChunks({
    chunks: input.chunks,
    madhhab: input.madhhab,
    variants: input.variants,
    allowTestFixtures: input.allowTestFixtures,
    limit: 8,
  });
  const approvedBeforeNeighbors = approved.length;
  approved = expandNeighbors(approved, approvedPool, 1);

  let candidates = selectCandidateChunks({
    chunks: input.chunks,
    madhhab: input.madhhab,
    variants: input.variants,
    allowTestFixtures: input.allowTestFixtures,
    limit: 8,
  });
  const candidatesBeforeNeighbors = candidates.length;
  candidates = expandNeighbors(candidates, candidatePool, 1);

  const originalText = input.variants.find((variant) => variant.kind === "original")?.text ?? "";
  const glossaryEn = input.variants.filter((variant) => variant.kind === "glossary" && variant.language === "en");
  const mentioned = glossaryEn.flatMap((variant) => variant.text.split(/\s+/)).filter((token) => token.length >= 4 && originalText.toLowerCase().includes(token.toLowerCase()));
  const queries = [
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
      queries,
      fetchImpl: input.fetchImpl,
      limit: 3,
      fetchPages: true,
      delayMs: input.fetchImpl ? 0 : 350,
    })
    : { searched: [], skipped: input.institutions.map((item) => ({ id: item.id, domain: item.domain, reason: approvedBeforeNeighbors > 0 ? "Local approved book evidence was sufficient, so websites were not searched." : "Website search was not requested." })), hits: [], queries };

  const institutional = websiteHitsToChunks(websites.hits).map((chunk) => ({ ...chunk, retrievalScore: 1, semanticScore: null as number | null }));

  const evidenceRole: ResearchSummary["evidenceRole"] = approved.length > 0
    ? "approved"
    : institutional.length > 0
      ? "institutional"
      : candidates.length > 0
        ? "candidate"
        : "none";
  const selected = evidenceRole === "approved" ? approved : evidenceRole === "institutional" ? institutional : evidenceRole === "candidate" ? candidates : [];
  const neighborsAdded = evidenceRole === "approved"
    ? approved.length - approvedBeforeNeighbors
    : evidenceRole === "candidate"
      ? candidates.length - candidatesBeforeNeighbors
      : 0;

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
    searchMethods: [
      "original question",
      "normalized text",
      "terminology registry (Arabic and Urdu)",
      "lexical overlap",
      "neighbouring PDF pages",
      "madhhab filter",
      "approval gates",
      "candidate discovery (unmeasured or unapproved text, labelled, never used as a ruling)",
      "approved-website OpenSearch/RSS and path-restricted page fetch",
    ],
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
    summary,
  };
}
