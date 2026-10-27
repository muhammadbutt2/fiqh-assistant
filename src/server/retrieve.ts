import { conceptById, findConcepts, type Concept } from "@/data/glossary";
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

export type RejectedPassage = {
  sourceId: string;
  title: string;
  documentId: string;
  reason: string;
  score: number;
  evidenceRole: "approved" | "candidate";
};

const QUERY_STOP = new Set(["the", "and", "for", "that", "this", "with", "from", "are", "was", "what", "هل", "في", "من", "على", "عن", "الى", "إلى", "کیا", "كيا", "اور", "پر"]);
const NON_TOPIC_CATEGORIES = new Set(["question_intent", "legal_category"]);
/** Companion topics that must not satisfy a more specific question on their own. */
const GENERIC_TOPICS = new Set(["salah", "taharah"]);

/** Concepts that commonly qualify a topic without being a substitute for it. */
const SUPPORTING: Record<string, readonly string[]> = {
  zakat: ["nisab", "hawl", "dayn"],
  sadaqah: [],
  sadaqat_al_fitr: ["sawm"],
  salah: ["tashahhud", "rakah", "sajda_sahw", "wudu", "taharah"],
  wudu: ["taharah", "ghusl", "tayammum"],
  ghusl: ["taharah", "wudu", "tayammum"],
  tayammum: ["taharah", "wudu", "ghusl"],
  sawm: ["qada", "kaffarah", "fidyah"],
  talaq: ["iddah", "khula", "faskh"],
  nikah: ["mahr", "wali"],
  hajj: ["umrah"],
  umrah: ["hajj"],
  qard: ["dayn", "riba"],
  bay: ["riba", "ijarah"],
};

function variantTokens(text: string): string[] {
  const tokens = tokenize(text).filter((token) => !QUERY_STOP.has(token));
  return tokens.length > 0 ? tokens : tokenize(text);
}

function originalQuestion(variants: QueryVariant[]): string {
  return variants.find((variant) => variant.kind === "original")?.text
    ?? variants.map((variant) => variant.text).join(" ");
}

export function topicConcepts(text: string): Concept[] {
  return findConcepts(text).filter((item) => !NON_TOPIC_CATEGORIES.has(item.category));
}

function supportingIds(queryTopics: Concept[]): Set<string> {
  const ids = new Set<string>();
  for (const topic of queryTopics) {
    for (const extra of SUPPORTING[topic.id] ?? []) ids.add(extra);
  }
  return ids;
}

export type RelevanceVerdict = {
  relevant: boolean;
  score: number;
  reason: string;
  overlap: string[];
  competing: string[];
};

/**
 * Decide whether a passage actually addresses the question.
 * Keyword overlap on obligation words (يجب, واجب) is not enough when the question
 * has a concrete fiqh topic such as zakat or wudu.
 */
export function scorePassageRelevance(question: string, passage: string, options: { neighborOfRelevant?: boolean; requirePrimaryTopic?: boolean } = {}): RelevanceVerdict {
  const queryTopics = topicConcepts(question);
  const passageTopics = topicConcepts(passage);
  const queryIds = new Set(queryTopics.map((item) => item.id));
  const required = queryTopics.filter((item) => !GENERIC_TOPICS.has(item.id));
  const need = required.length > 0 ? required : queryTopics;
  const needIds = new Set(need.map((item) => item.id));
  const support = supportingIds(need.length > 0 ? need : queryTopics);
  const overlap = passageTopics.filter((item) => needIds.has(item.id)).map((item) => item.id);
  const supportingHits = passageTopics.filter((item) => support.has(item.id)).map((item) => item.id);
  const competing = passageTopics
    .filter((item) => !queryIds.has(item.id) && !support.has(item.id))
    .map((item) => item.id);

  if (queryTopics.length === 0) {
    const shared = lexicalOverlap(question, passage);
    if (shared < 0.18) return { relevant: false, score: shared, reason: "No recognised topic and too little wording in common.", overlap, competing };
    return { relevant: true, score: shared, reason: "Lexical overlap on the original wording.", overlap, competing };
  }

  if (overlap.length > 0) {
    const penalty = competing.length > overlap.length ? 0.4 : 0;
    return {
      relevant: true,
      score: overlap.length + supportingHits.length * 0.4 - penalty,
      reason: `Addresses ${overlap.join(", ")}.`,
      overlap,
      competing,
    };
  }

  if (options.requirePrimaryTopic) {
    return {
      relevant: false,
      score: 0,
      reason: `The source does not discuss ${need.map((item) => item.id).join(", ") || "the asked topic"}.`,
      overlap,
      competing,
    };
  }

  if (supportingHits.length > 0 && competing.length === 0) {
    return {
      relevant: true,
      score: 0.55 + supportingHits.length * 0.2,
      reason: `Supports the question through ${supportingHits.join(", ")}.`,
      overlap,
      competing,
    };
  }

  if (options.neighborOfRelevant && competing.length === 0) {
    const shared = lexicalOverlap(question, passage);
    if (shared >= 0.12) {
      return { relevant: true, score: shared * 0.4, reason: "Neighbouring page kept as context.", overlap, competing };
    }
  }

  const competingLabel = competing.length > 0 ? competing.join(", ") : "a different subject";
  return {
    relevant: false,
    score: 0,
    reason: `The passage is about ${competingLabel}, not ${queryTopics.map((item) => item.id).join(", ")}.`,
    overlap,
    competing,
  };
}

function lexicalOverlap(question: string, passage: string): number {
  const query = new Set(variantTokens(question));
  if (query.size === 0) return 0;
  const tokens = tokenize(passage);
  const shared = tokens.filter((token) => tokenOverlaps(query, token));
  return shared.length / Math.max(query.size, 1);
}

export function selectChunks(input: {
  chunks: StoredChunk[];
  madhhab: Madhhab;
  variants: QueryVariant[];
  allowTestFixtures: boolean;
  limit?: number;
}): SelectedChunk[] {
  return rankChunks(input.chunks.filter((chunk) => chunkAllowed(chunk, input.madhhab, input.allowTestFixtures)), input.variants, input.limit ?? 8).relevant;
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
  return rankChunks(pool, input.variants, input.limit ?? 8).relevant;
}

export function expandNeighbors(selected: SelectedChunk[], pool: StoredChunk[], radius = 1, question?: string): SelectedChunk[] {
  if (selected.length === 0 || radius < 1) return selected;
  const have = new Set(selected.map((chunk) => `${chunk.documentId}:${chunk.pdfPageStart}`));
  const extra: SelectedChunk[] = [];
  const query = question ?? "";
  for (const chunk of selected) {
    for (let delta = -radius; delta <= radius; delta++) {
      if (delta === 0) continue;
      const page = chunk.pdfPageStart + delta;
      for (const neighbor of pool) {
        if (neighbor.documentId !== chunk.documentId || neighbor.pdfPageStart !== page) continue;
        const key = `${neighbor.documentId}:${neighbor.pdfPageStart}`;
        if (have.has(key)) continue;
        have.add(key);
        if (query) {
          const verdict = scorePassageRelevance(query, neighbor.originalText, { neighborOfRelevant: true });
          if (!verdict.relevant) continue;
        }
        extra.push({ ...neighbor, retrievalScore: chunk.retrievalScore * 0.35, semanticScore: null });
      }
    }
  }
  return extra.length === 0 ? selected : [...selected, ...extra];
}

function rankChunks(eligible: StoredChunk[], variants: QueryVariant[], limit: number): { relevant: SelectedChunk[]; rejected: RejectedPassage[] } {
  const question = originalQuestion(variants);
  const variantSets = variants.map((variant) => ({ variant, tokens: new Set(variantTokens(variant.text)) }));
  const rejected: RejectedPassage[] = [];
  const scored = eligible
    .map((chunk) => {
      const tokens = tokenize(chunk.normalizedText || chunk.originalText);
      let retrievalScore = 0;
      let matched = false;
      for (const entry of variantSets) {
        if (entry.variant.kind === "glossary" && NON_TOPIC_CATEGORIES.has(conceptById(entry.variant.text)?.category ?? "")) continue;
        const shared = tokens.filter((token) => tokenOverlaps(entry.tokens, token));
        if (shared.length === 0) continue;
        const intentOnly = entry.variant.kind === "glossary" && isIntentGlossary(entry.variant.text);
        if (intentOnly && !topicConcepts(chunk.originalText).some((item) => topicConcepts(question).some((query) => query.id === item.id))) {
          continue;
        }
        matched = true;
        const scriptBoost = entry.variant.language === "ar" || entry.variant.language === "ur" ? 1.15 : 1;
        const weight = entry.variant.kind === "glossary" && isIntentGlossary(entry.variant.text) ? 0.15 : 1;
        retrievalScore += scriptBoost * weight * (shared.length / Math.max(entry.tokens.size, 1));
      }
      const verdict = scorePassageRelevance(question, chunk.originalText);
      if (!verdict.relevant) {
        rejected.push({
          sourceId: chunk.id,
          title: chunk.title,
          documentId: chunk.documentId,
          reason: verdict.reason,
          score: Number((retrievalScore + verdict.score).toFixed(4)),
          evidenceRole: chunk.trustClassification === "approved" && chunk.verificationStatus === "verified" ? "approved" : "candidate",
        });
        return null;
      }
      if (!matched && verdict.score < 0.55) {
        rejected.push({
          sourceId: chunk.id,
          title: chunk.title,
          documentId: chunk.documentId,
          reason: "Not enough of the search wording appears in the passage.",
          score: Number(verdict.score.toFixed(4)),
          evidenceRole: "approved",
        });
        return null;
      }
      const phrase = variants.some((variant) => variant.kind === "glossary" && chunk.normalizedText.includes(tokenize(variant.text).slice(-1)[0] ?? ""));
      retrievalScore = Math.min(retrievalScore + verdict.score, 4) + CLASS_WEIGHT[chunk.sourceClass] + (phrase ? 0.1 : 0);
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
  return { relevant: unique.slice(0, limit), rejected };
}

function isIntentGlossary(text: string): boolean {
  const folded = text.toLowerCase();
  return /^(يجب|تجب|واجب|يصح|تصح|يبطل|تبطل|يجوز|هل يجب|is it obligatory|do i have to)/.test(folded.trim());
}

function tokenOverlaps(queryTokens: Set<string>, token: string): boolean {
  if (queryTokens.has(token)) return true;
  const arabic = /[\u0600-\u06ff]/.test(token);
  if (!arabic && token.length < 5) return false;
  if (token.length < 4) return false;
  for (const item of queryTokens) {
    if (item.length < 4) continue;
    const itemArabic = /[\u0600-\u06ff]/.test(item);
    if (arabic && itemArabic && (token.includes(item) || item.includes(token))) return true;
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

export function humanQualityReason(code: string | null): string {
  switch (code) {
    case "ocr_unmeasured":
    case "ocr_uncertain":
    case "ocr_accuracy_not_passed":
      return "The matching pages are unmeasured OCR and cannot support a verified quotation.";
    case "ocr_poor":
      return "The matching pages failed OCR quality checks.";
    case "rights_not_approved":
    case "rights_rejected":
      return "The matching book is not cleared for quotation.";
    case "not_approved":
    case "not_verified":
    case "untrusted":
    case "verification_rejected":
      return "The matching book has not completed source approval.";
    case "wrong_madhhab":
    case "comparative_not_labelled_for_madhhab":
      return "The matching source belongs to a different school, or is not labelled for the selected school.";
    case "not_searchable":
      return "The book is registered but its text is not in the searchable index.";
    case "unverified_source_class":
      return "The source class is unverified.";
    default:
      return code ? "The matching passage is not eligible approved evidence." : "The passage is not eligible.";
  }
}

export function hasUnresolvedDisagreement(chunks: StoredChunk[]): boolean {
  if (chunks.length < 2) return false;
  const flags = chunks.slice(0, 4).map((chunk) => hasNegation(chunk.originalText));
  return flags.some(Boolean) && flags.some((flag) => !flag);
}

export function collectRejectedCandidates(input: {
  chunks: StoredChunk[];
  madhhab: Madhhab;
  variants: QueryVariant[];
  allowTestFixtures: boolean;
  limit?: number;
}): { relevant: SelectedChunk[]; rejectedIrrelevant: RejectedPassage[]; rejectedQuality: RejectedPassage[] } {
  const question = originalQuestion(input.variants);
  const rejectedQuality: RejectedPassage[] = [];
  const discoverable: StoredChunk[] = [];
  for (const chunk of input.chunks) {
    if (!chunkDiscoverable(chunk, input.madhhab, input.allowTestFixtures)) continue;
    if (chunkAllowed(chunk, input.madhhab, input.allowTestFixtures)) {
      discoverable.push(chunk);
      continue;
    }
    const quality = explainRejection(chunk, input.madhhab, input.allowTestFixtures);
    const verdict = scorePassageRelevance(question, chunk.originalText);
    if (!verdict.relevant) continue;
    rejectedQuality.push({
      sourceId: chunk.id,
      title: chunk.title,
      documentId: chunk.documentId,
      reason: humanQualityReason(quality),
      score: verdict.score,
      evidenceRole: "candidate",
    });
  }
  const ranked = rankChunks(discoverable.filter((chunk) => chunkAllowed(chunk, input.madhhab, input.allowTestFixtures)), input.variants, input.limit ?? 8);
  const candidateRanked = rankChunks(
    input.chunks.filter((chunk) => chunkDiscoverable(chunk, input.madhhab, input.allowTestFixtures) && !chunkAllowed(chunk, input.madhhab, input.allowTestFixtures)),
    input.variants,
    input.limit ?? 8,
  );
  return {
    relevant: ranked.relevant,
    rejectedIrrelevant: [...ranked.rejected, ...candidateRanked.rejected].slice(0, 20),
    rejectedQuality: rejectedQuality.slice(0, 20),
  };
}
