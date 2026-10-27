import { z } from "zod";
import { findConcepts, searchTermsFor, type Concept } from "@/data/glossary";
import { isSupportedLanguage, type SupportedLanguage } from "@/data/languages";
import type { Translator } from "@/server/ai";
import { detectLanguage, isHighStakes, negationWords, type DetectionWithConfidence } from "@/server/detect";
import { normalizeForSearch } from "@/server/normalize";
import type { QueryVariant } from "@/server/types";

/**
 * Three-language query processing.
 *
 * Input: a question in English, Urdu or Arabic (Roman Urdu is accepted as Urdu).
 * Output: the original question untouched, the detected language, a normalized retrieval
 * form, an Arabic search query, an Urdu search query, the fiqh concepts recognised, the
 * entities that must survive translation (numbers, quantities, conditions, negations), the
 * ambiguities a reader should know about, and the ordered retrieval variants.
 *
 * Without a translation provider the Arabic and Urdu queries for a bridged language are
 * terminology strings, not sentence translations. The `method` field says which.
 */

const queryTextSchema = z.object({
  text: z.string().nullable(),
  method: z.enum(["source_language", "terminology", "provider", "none"]),
  model: z.string().nullable(),
});

export const processedQuerySchema = z.object({
  original: z.string(),
  detectedLanguage: z.string(),
  detectionConfidence: z.enum(["high", "medium", "low"]),
  detectionUncertain: z.boolean(),
  mixedScript: z.boolean(),
  normalized: z.string(),
  arabicQuery: queryTextSchema,
  urduQuery: queryTextSchema,
  englishIntermediate: z.string().nullable(),
  concepts: z.array(z.object({
    id: z.string(),
    category: z.string(),
    en: z.string(),
    ar: z.string(),
    ur: z.string(),
    note: z.string(),
    relatedDistinct: z.array(z.string()),
  })),
  entities: z.object({
    numbers: z.array(z.string()),
    quantities: z.array(z.string()),
    conditions: z.array(z.string()),
    negations: z.array(z.string()),
    timeReferences: z.array(z.string()),
  }),
  ambiguities: z.array(z.string()),
  warnings: z.array(z.string()),
  highStakes: z.boolean(),
  translationMethod: z.enum(["original_only", "glossary_terms_only", "provider", "provider_failed"]),
  translationModel: z.string().nullable(),
});

export type ProcessedQuery = z.infer<typeof processedQuerySchema> & { variants: QueryVariant[]; detection: DetectionWithConfidence };

const NUMBER_WORDS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|half|quarter|third)\b|(?:^|\s)(ایک|دو|تین|چار|پانچ|چھ|سات|آٹھ|نو|دس|سو|ہزار|آدھا|آدھی|چوتھائی|واحد|اثنان|اثنين|ثلاث|ثلاثة|أربع|أربعة|خمس|خمسة|عشر|عشرة|مائة|مئة|ألف|نصف|ربع|ثلث)(?=\s|$)/giu;
const QUANTITY = /\b\d+(?:[.,]\d+)?\s*(?:%|percent|tola|tolas|gram|grams|g|kg|kilo|ounce|oz|dirham|dirhams|dinar|dinars|mithqal|rupees|rs|dollars|usd|pkr|riyal|sa'|saa|mudd)\b|(?:^|\s)\d+(?:[.,]\d+)?\s*(?:تولہ|گرام|کلو|روپے|ڈالر|درهم|دراهم|دينار|دنانير|مثقال|صاع|مد|ریال|فیصد|٪)(?=\s|$)|\b(?:nisab|tola|mithqal|dirham|dinar|sa'|mudd)\b|نصاب|تولہ|مثقال|درهم|دينار|صاع/giu;
const CONDITION = /\b(if|when|whenever|unless|while|before|after|during|only|except|provided|in case|as long as|whether)\b|(?:^|\s)(اگر|جب|جبکہ|بغیر|سوا|سوائے|صرف|پہلے|بعد|دوران|بشرطیکہ|إذا|اذا|إن|ان|لو|إلا|الا|بغير|بدون|قبل|بعد|حتى|فقط|بشرط|أثناء|اثناء)(?=\s|$)/giu;
const TIME = /\b(ramadan|ramzan|eid|fajr|dhuhr|zuhr|asr|maghrib|isha|jumu'?ah|friday|year|month|day|night|sunset|sunrise|dawn)\b|(?:^|\s)(رمضان|عید|عيد|فجر|ظہر|ظهر|عصر|مغرب|عشاء|عشا|جمعہ|جمعة|سال|مہینہ|مہینے|دن|رات|سنة|شهر|يوم|ليلة|حول)(?=\s|$)/giu;

function matches(pattern: RegExp, text: string): string[] {
  const found = Array.from(text.matchAll(pattern), (match) => (match[1] ?? match[2] ?? match[0]).trim()).filter(Boolean);
  return Array.from(new Set(found.map((item) => item.toLowerCase())));
}

function numbers(text: string): string[] {
  const digits = normalizeForSearch(text).match(/\d+(?:[.,]\d+)?/g) ?? [];
  const words = matches(NUMBER_WORDS, text);
  return Array.from(new Set([...digits, ...words]));
}

function uniqueJoin(parts: string[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts.map((item) => item.trim()).filter(Boolean)) {
    if (seen.has(part)) continue;
    seen.add(part);
    kept.push(part);
  }
  return kept.join(" ");
}

function ambiguitiesFor(concepts: Concept[], detection: DetectionWithConfidence, text: string): string[] {
  const ids = new Set(concepts.map((item) => item.id));
  const notes: string[] = [];
  const pairs: [string, string, string][] = [
    ["zakat", "sadaqah", "Both zakat and sadaqah are mentioned. They are different categories and are searched as separate terms."],
    ["zakat", "sadaqat_al_fitr", "Zakat on wealth and sadaqat al-fitr are both mentioned. They are separate obligations."],
    ["fard", "wajib", "Both fard and wajib appear. In Hanafi usage they are distinct levels; the search keeps both words."],
    ["wudu", "ghusl", "Both wudu and ghusl appear. They are different purifications."],
    ["talaq", "khula", "Talaq and khula are both mentioned. They are different acts with different consequences."],
    ["qard", "dayn", "Loan and debt are both mentioned. The books treat them as related but distinct."],
    ["hajj", "umrah", "Hajj and umrah are both mentioned. Their rules differ."],
    ["yamin", "nadhr", "Oath and vow are both mentioned. They bind differently."],
  ];
  for (const [a, b, note] of pairs) if (ids.has(a) && ids.has(b)) notes.push(note);
  const intents = concepts.filter((item) => item.category === "question_intent");
  if (intents.length > 1) notes.push(`The question mixes ${intents.map((item) => item.en).join(" and ")}. These are different legal questions and are not merged.`);
  if (ids.has("intent_validity") && ids.has("intent_obligation")) notes.push("Validity and obligation are both asked. A valid act is not thereby obligatory, and an obligatory act is not thereby valid.");
  if (detection.mixed) notes.push("The question mixes scripts. Each script was searched in its own language.");
  if (detection.uncertain) notes.push("The question language was not certain. Arabic and Urdu terms were both searched.");
  if (normalizeForSearch(text).split(" ").length <= 2 && concepts.length > 0) notes.push("The question is a bare term. Retrieval returns the topic, not an answer to a specific situation.");
  return notes;
}

/** Deterministic processing with no provider call. */
export function processQuestion(question: string, options: { queryLanguage?: string } = {}): ProcessedQuery {
  const detection: DetectionWithConfidence = options.queryLanguage
    ? { language: options.queryLanguage, script: "Zyyy", mixed: false, uncertain: false, candidates: [options.queryLanguage], romanUrdu: options.queryLanguage === "ur-Latn", signals: ["user-confirmed"], confidence: "high" }
    : detectLanguage(question);
  const language = detection.language;
  const concepts = findConcepts(question);
  const terms = searchTermsFor(concepts, question);
  const normalized = normalizeForSearch(question);
  const warnings: string[] = [];

  const variants: QueryVariant[] = [
    { id: "original", kind: "original", language, text: question, method: "identity", model: null },
    { id: "normalized", kind: "normalized", language, text: normalized, method: "unicode_search_normalization", model: null },
  ];

  const contextual = terms.contexts.length > 0;
  const phraseMethod = contextual ? "terminology_pattern" : "glossary_terms_only";
  const arabicTerms = uniqueJoin(terms.ar);
  const urduTerms = uniqueJoin(terms.ur);
  const englishTerms = uniqueJoin(terms.en);
  if (concepts.length > 0) {
    variants.push({ id: "glossary-ar", kind: "glossary", language: "ar", text: arabicTerms, method: phraseMethod, model: null });
    variants.push({ id: "glossary-ur", kind: "glossary", language: "ur", text: urduTerms, method: phraseMethod, model: null });
    if (englishTerms) variants.push({ id: "glossary-en", kind: "glossary", language: "en", text: englishTerms, method: "glossary_terms_only", model: null });
  }

  const arabicQuery = language === "ar"
    ? { text: normalized, method: "source_language" as const, model: null }
    : concepts.length > 0
      ? { text: arabicTerms, method: "terminology" as const, model: null }
      : { text: null, method: "none" as const, model: null };
  const urduQuery = language === "ur" || language === "ur-Latn"
    ? (language === "ur"
      ? { text: normalized, method: "source_language" as const, model: null }
      : concepts.length > 0 ? { text: urduTerms, method: "terminology" as const, model: null } : { text: null, method: "none" as const, model: null })
    : concepts.length > 0
      ? { text: urduTerms, method: "terminology" as const, model: null }
      : { text: null, method: "none" as const, model: null };

  if (concepts.length === 0) warnings.push("No fiqh term from the registry was recognised. Without a translation provider the Arabic and Urdu queries are empty and only the original wording is searched.");
  else if (language === "ar") warnings.push("The Urdu query is a terminology string, not a translation of the whole sentence.");
  else if (language === "ur") warnings.push("The Arabic query is a terminology string, not a translation of the whole sentence.");
  else warnings.push("Arabic and Urdu queries for a bridged language are terminology strings, not a translation of the whole sentence.");
  if (!isSupportedLanguage(language) && language !== "ur-Latn") warnings.push("The question language is not one of English, Urdu or Arabic, or could not be determined. The search still ran.");
  if (language === "ur-Latn") warnings.push("Roman Urdu was detected. Only registry terms map into Urdu script; the rest of the sentence is not transliterated.");

  const entities = {
    numbers: numbers(question),
    quantities: matches(QUANTITY, question),
    conditions: matches(CONDITION, question),
    negations: negationWords(question),
    timeReferences: matches(TIME, question),
  };

  return {
    original: question,
    detectedLanguage: language,
    detectionConfidence: detection.confidence,
    detectionUncertain: detection.uncertain,
    mixedScript: detection.mixed,
    normalized,
    arabicQuery,
    urduQuery,
    englishIntermediate: language === "en" ? question : englishTerms || null,
    concepts: concepts.map((item) => ({ id: item.id, category: item.category, en: item.en, ar: item.ar, ur: item.ur, note: item.note, relatedDistinct: item.relatedDistinct })),
    entities,
    ambiguities: ambiguitiesFor(concepts, detection, question),
    warnings,
    highStakes: isHighStakes(question),
    translationMethod: concepts.length > 0 ? "glossary_terms_only" : "original_only",
    translationModel: null,
    variants,
    detection,
  };
}

/** Adds provider translations when a translator is configured. The deterministic result is kept if the provider fails. */
export async function processQuestionWithProvider(question: string, options: { queryLanguage?: string; translator?: Translator | null; signal?: AbortSignal } = {}): Promise<ProcessedQuery> {
  const result = processQuestion(question, { queryLanguage: options.queryLanguage });
  const translator = options.translator;
  if (!translator?.available()) return result;
  const targets: SupportedLanguage[] = (["ar", "ur"] as const).filter((target) => target !== result.detectedLanguage && !(target === "ur" && result.detectedLanguage === "ur-Latn"));
  if (targets.length === 0) return result;
  try {
    const translated = await translator.translate(question, targets, options.signal);
    const usable = translated.filter((item) => (item.language === "ar" || item.language === "ur") && item.text.trim().length > 0);
    usable.forEach((item, index) => {
      result.variants.push({ id: `translation-${index}`, kind: "translation", language: item.language, text: item.text, method: "provider", model: item.model });
      const query = { text: item.text, method: "provider" as const, model: item.model };
      if (item.language === "ar" && result.arabicQuery.method !== "source_language") result.arabicQuery = query;
      if (item.language === "ur" && result.urduQuery.method !== "source_language") result.urduQuery = query;
    });
    if (usable.length > 0) {
      result.translationMethod = "provider";
      result.translationModel = usable[0].model;
      result.warnings = result.warnings.filter((item) => !item.includes("terminology strings") && !item.includes("Without a translation provider"));
      result.warnings.push("Provider translations are search aids and are checked against the original question's negations and conditions by the answer step, not treated as rulings.");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    result.translationMethod = "provider_failed";
    result.warnings.push("The translation provider failed. The search used the original wording and registry terms.");
  }
  return result;
}

/** Compatibility wrapper kept for callers that only need the retrieval variants. */
export function buildVariants(question: string, detection?: DetectionWithConfidence | { language: string }): { variants: QueryVariant[]; method: string; model: string | null } {
  const processed = processQuestion(question, detection && "signals" in detection && detection.signals.includes("user-confirmed") ? { queryLanguage: detection.language } : {});
  return { variants: processed.variants, method: processed.translationMethod, model: processed.translationModel };
}
