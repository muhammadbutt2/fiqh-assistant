import type { Madhhab } from "@/server/madhhab";
import { hasNegation } from "@/server/detect";
import { tokenize } from "@/server/normalize";
import type { QueryVariant, StoredChunk } from "@/server/types";

const CLASS_WEIGHT: Record<StoredChunk["sourceClass"], number> = {
  primary: 0.2,
  institutional_fatwa: 0.15,
  secondary: 0.08,
  comparative: 0.02,
  unverified: 0,
};

export type SelectedChunk = StoredChunk & { retrievalScore: number; semanticScore: number | null };

const QUERY_STOP = new Set(["the", "and", "for", "that", "this", "with", "from", "are", "was", "what", "هل", "في", "من", "على", "عن", "الى", "إلى", "کیا", "كيا", "اور", "پر"]);

function variantTokens(text: string): string[] {
  const tokens = tokenize(text).filter((token) => !QUERY_STOP.has(token));
  return tokens.length > 0 ? tokens : tokenize(text);
}

export function selectChunks(input: {
  chunks: StoredChunk[];
  madhhab: Madhhab;
  variants: QueryVariant[];
  allowTestFixtures: boolean;
  limit?: number;
}): SelectedChunk[] {
  return rankChunks(input.chunks.filter((chunk) => chunkAllowed(chunk, input.madhhab, input.allowTestFixtures)), input.variants, input.limit ?? 8);
}

/** Matching passages that are not approved evidence: unmeasured OCR, pending rights, awaiting review. */
export function selectCandidateChunks(input: {
  chunks: StoredChunk[];
  madhhab: Madhhab;
  variants: QueryVariant[];
  allowTestFixtures: boolean;
  limit?: number;
}): SelectedChunk[] {
  const pool = input.chunks.filter((chunk) => chunkDiscoverable(chunk, input.madhhab, input.allowTestFixtures) && !chunkAllowed(chunk, input.madhhab, input.allowTestFixtures));
  return rankChunks(pool, input.variants, input.limit ?? 8);
}

export function expandNeighbors(selected: SelectedChunk[], pool: StoredChunk[], radius = 1): SelectedChunk[] {
  if (selected.length === 0 || radius < 1) return selected;
  const have = new Set(selected.map((chunk) => `${chunk.documentId}:${chunk.pdfPageStart}`));
  const extra: SelectedChunk[] = [];
  for (const chunk of selected) {
    for (let delta = -radius; delta <= radius; delta++) {
      if (delta === 0) continue;
      const page = chunk.pdfPageStart + delta;
      for (const neighbor of pool) {
        if (neighbor.documentId !== chunk.documentId || neighbor.pdfPageStart !== page) continue;
        const key = `${neighbor.documentId}:${neighbor.pdfPageStart}`;
        if (have.has(key)) continue;
        have.add(key);
        extra.push({ ...neighbor, retrievalScore: chunk.retrievalScore * 0.35, semanticScore: null });
      }
    }
  }
  return extra.length === 0 ? selected : [...selected, ...extra];
}

function rankChunks(eligible: StoredChunk[], variants: QueryVariant[], limit: number): SelectedChunk[] {
  const variantSets = variants.map((variant) => ({ variant, tokens: new Set(variantTokens(variant.text)) }));
  const scored = eligible
    .map((chunk) => {
      const tokens = tokenize(chunk.normalizedText || chunk.originalText);
      let retrievalScore = 0;
      let matched = false;
      for (const entry of variantSets) {
        const shared = tokens.filter((token) => tokenOverlaps(entry.tokens, token));
        if (shared.length === 0) continue;
        matched = true;
        const scriptBoost = entry.variant.language === "ar" || entry.variant.language === "ur" ? 1.15 : 1;
        retrievalScore += scriptBoost * (shared.length / Math.max(entry.tokens.size, 1));
      }
      if (!matched) return null;
      const phrase = variants.some((variant) => variant.kind === "glossary" && chunk.normalizedText.includes(tokenize(variant.text).slice(-1)[0] ?? ""));
      retrievalScore = Math.min(retrievalScore, 3) + CLASS_WEIGHT[chunk.sourceClass] + (phrase ? 0.1 : 0);
      return { ...chunk, retrievalScore, semanticScore: null as number | null };
    })
    .filter((chunk): chunk is SelectedChunk => chunk !== null);

  const seen = new Set<string>();
  const unique: SelectedChunk[] = [];
  for (const chunk of scored.sort((a, b) => b.retrievalScore - a.retrievalScore || a.id.localeCompare(b.id))) {
    const key = `${chunk.documentId}:${chunk.originalText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(chunk);
  }
  return unique.slice(0, limit);
}

function tokenOverlaps(queryTokens: Set<string>, token: string): boolean {
  if (queryTokens.has(token)) return true;
  if (token.length < 4) return false;
  for (const item of queryTokens) {
    if (item.length < 4) continue;
    if (token.includes(item) || item.includes(token)) return true;
  }
  return false;
}

function madhhabApplies(chunk: StoredChunk, madhhab: Madhhab): boolean {
  if (chunk.sourceClass === "comparative") {
    return chunk.comparativeAppliesTo.includes(madhhab) && chunk.opinionLabels.length > 0;
  }
  return chunk.madhhab === madhhab;
}

/** Approved evidence only. Unmeasured OCR, pending rights, and unverified rows stay out. */
export function chunkAllowed(chunk: StoredChunk, madhhab: Madhhab, allowTestFixtures: boolean): boolean {
  if (!chunk.searchable) return false;
  if (chunk.isTestFixture && !allowTestFixtures) return false;
  if (chunk.trustClassification !== "approved") return false;
  if (chunk.verificationStatus !== "verified") return false;
  if (chunk.rightsStatus !== "approved_for_ingestion") return false;
  if (chunk.ocrQuality !== "not_needed" && chunk.ocrQuality !== "acceptable") return false;
  if (chunk.provenance?.extraction === "ocr" && (chunk.ocrQuality !== "acceptable" || chunk.provenance.accuracy.status !== "passed")) return false;
  if (chunk.sourceClass === "unverified") return false;
  if (chunk.translation?.obscuresCondition) return false;
  return madhhabApplies(chunk, madhhab);
}

/** Candidate discovery: same madhhab, real text, not rejected. Does not make the passage approved evidence. */
export function chunkDiscoverable(chunk: StoredChunk, madhhab: Madhhab, allowTestFixtures: boolean): boolean {
  if (!chunk.originalText.trim()) return false;
  if (chunk.isTestFixture && !allowTestFixtures) return false;
  if (chunk.sourceClass === "unverified") return false;
  if (chunk.rightsStatus === "rejected") return false;
  if (chunk.trustClassification === "untrusted") return false;
  if (chunk.verificationStatus === "rejected") return false;
  if (chunk.ocrQuality === "poor") return false;
  if (chunk.translation?.obscuresCondition) return false;
  return madhhabApplies(chunk, madhhab);
}

export function explainRejection(chunk: StoredChunk, madhhab: Madhhab, allowTestFixtures: boolean): string | null {
  if (chunkAllowed(chunk, madhhab, allowTestFixtures)) return null;
  if (chunk.isTestFixture && !allowTestFixtures) return "test_fixture";
  if (!madhhabApplies(chunk, madhhab)) return chunk.sourceClass === "comparative" ? "comparative_not_labelled_for_madhhab" : "wrong_madhhab";
  if (chunk.sourceClass === "unverified") return "unverified_source_class";
  if (chunk.translation?.obscuresCondition) return "translation_obscures_condition";
  if (chunk.rightsStatus === "rejected") return "rights_rejected";
  if (chunk.trustClassification === "untrusted") return "untrusted";
  if (chunk.verificationStatus === "rejected") return "verification_rejected";
  if (chunk.ocrQuality === "poor") return "ocr_poor";
  if (chunk.ocrQuality === "unmeasured" || chunk.ocrQuality === "uncertain") return `ocr_${chunk.ocrQuality}`;
  if (chunk.provenance?.extraction === "ocr" && chunk.provenance.accuracy.status !== "passed") return "ocr_accuracy_not_passed";
  if (chunk.rightsStatus !== "approved_for_ingestion") return "rights_not_approved";
  if (chunk.trustClassification !== "approved") return "not_approved";
  if (chunk.verificationStatus !== "verified") return "not_verified";
  if (!chunk.searchable) return "not_searchable";
  return "excluded";
}

export function hasUnresolvedDisagreement(chunks: StoredChunk[]): boolean {
  if (chunks.length < 2) return false;
  const flags = chunks.slice(0, 4).map((chunk) => hasNegation(chunk.originalText));
  return flags.some(Boolean) && flags.some((flag) => !flag);
}
