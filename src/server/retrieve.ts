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
  const variantSets = input.variants.map((variant) => ({ variant, tokens: new Set(variantTokens(variant.text)) }));
  const eligible = input.chunks.filter((chunk) => chunkAllowed(chunk, input.madhhab, input.allowTestFixtures));
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
      const phrase = input.variants.some((variant) => variant.kind === "glossary" && chunk.normalizedText.includes(tokenize(variant.text).slice(-1)[0] ?? ""));
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
  return unique.slice(0, input.limit ?? 8);
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
  if (chunk.sourceClass === "comparative") {
    return chunk.comparativeAppliesTo.includes(madhhab) && chunk.opinionLabels.length > 0;
  }
  return chunk.madhhab === madhhab;
}

export function hasUnresolvedDisagreement(chunks: StoredChunk[]): boolean {
  if (chunks.length < 2) return false;
  const flags = chunks.slice(0, 4).map((chunk) => hasNegation(chunk.originalText));
  return flags.some(Boolean) && flags.some((flag) => !flag);
}
