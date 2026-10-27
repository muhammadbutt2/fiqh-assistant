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
import { searchApprovedWebsites, type WebsiteSearchReport } from "@/server/websites";

export type ResearchResult = {
  evidenceRole: ResearchSummary["evidenceRole"];
  selected: SelectedChunk[];
  approved: SelectedChunk[];
  candidates: SelectedChunk[];
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

  const evidenceRole: ResearchSummary["evidenceRole"] = approved.length > 0 ? "approved" : candidates.length > 0 ? "candidate" : "none";
  const selected = evidenceRole === "approved" ? approved : evidenceRole === "candidate" ? candidates : [];
  const neighborsAdded = evidenceRole === "approved"
    ? approved.length - approvedBeforeNeighbors
    : evidenceRole === "candidate"
      ? candidates.length - candidatesBeforeNeighbors
      : 0;

  const websites = await searchApprovedWebsites({ institutions: input.institutions, madhhab: input.madhhab });

  const summary: ResearchSummary = {
    evidenceRole,
    approvedMatches: approvedBeforeNeighbors,
    candidateMatches: candidatesBeforeNeighbors,
    neighborsAdded,
    approvedPool: approvedPool.length,
    candidatePool: candidatePool.length,
    websitesSearched: websites.searched.length,
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
    ],
  };

  return {
    evidenceRole,
    selected,
    approved,
    candidates,
    neighborsAdded,
    approvedPool: approvedPool.length,
    candidatePool: candidatePool.length,
    websites,
    summary,
  };
}
