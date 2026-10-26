import { findGlossaryHits } from "@/data/glossary";
import type { Detection, QueryVariant } from "@/server/types";

const HARAKAT = /[\u064B-\u0652\u0670\u0640\u06D6-\u06ED]/g;

export function normalizeForSearch(input: string): string {
  let text = input.normalize("NFC").replace(HARAKAT, "");
  text = text.replace(/[إأآٱ]/g, "ا");
  text = text.replace(/\u06A9/g, "\u0643");
  text = text.replace(/[\u06CC\u0649\u06D2]/g, "\u064A");
  text = text.replace(/[\u06C1\u06BE\u06C0]/g, "\u0647");
  text = text.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    return digit;
  });
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function tokenize(input: string): string[] {
  return normalizeForSearch(input)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

const ROMAN_URDU = new Set([
  "mein", "main", "kya", "kyun", "hai", "hain", "hoon", "hun", "namaz", "karun", "karoon",
  "bhool", "bhul", "gaya", "gayi", "nahi", "nahin", "rakat", "rakaat", "wuzu", "wudhu", "roza",
]);

function counts(text: string) {
  const tally = { arabic: 0, latin: 0, devanagari: 0, bengali: 0, cyrillic: 0, han: 0, kana: 0 };
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x0600 && code <= 0x06ff) tally.arabic += 1;
    else if ((code >= 0x0041 && code <= 0x024f) || (code >= 0x1e00 && code <= 0x1eff)) tally.latin += 1;
    else if (code >= 0x0900 && code <= 0x097f) tally.devanagari += 1;
    else if (code >= 0x0980 && code <= 0x09ff) tally.bengali += 1;
    else if (code >= 0x0400 && code <= 0x04ff) tally.cyrillic += 1;
    else if (code >= 0x4e00 && code <= 0x9fff) tally.han += 1;
    else if (code >= 0x3040 && code <= 0x30ff) tally.kana += 1;
  }
  return tally;
}

function scoreWords(text: string, words: string[]): number {
  const tokens = new Set(tokenize(text));
  return words.filter((word) => tokens.has(word)).length;
}

export function detectLanguage(text: string): Detection {
  const tally = counts(text);
  const signals: string[] = [];
  const scripts = Object.entries(tally).filter(([, count]) => count > 0).map(([name]) => name);
  const mixed = scripts.length > 1;
  const urduSpecific = /[ٹڈڑںےھہکڑ\u06CC\u06A9]/.test(text);

  if (tally.arabic > 0 && tally.arabic >= tally.latin) {
    const language = urduSpecific ? "ur" : "ar";
    if (urduSpecific) signals.push("urdu-letters");
    return {
      language,
      script: "Arab",
      mixed,
      uncertain: false,
      candidates: language === "ar" ? ["ar", "arz"] : ["ur"],
      romanUrdu: false,
      signals: language === "ar" ? [...signals, "arabic-script", "dialect-not-separated"] : signals,
    };
  }

  if (tally.bengali > 0 && tally.bengali >= tally.latin) {
    return { language: "bn", script: "Beng", mixed, uncertain: text.includes("ৰ"), candidates: ["bn"], romanUrdu: false, signals: ["bengali-script"] };
  }

  if (tally.devanagari > 0 && tally.devanagari >= tally.latin) {
    const marathi = text.includes("ळ");
    return {
      language: marathi ? "mr" : "hi",
      script: "Deva",
      mixed,
      uncertain: !marathi,
      candidates: marathi ? ["mr"] : ["hi", "mr"],
      romanUrdu: false,
      signals: [marathi ? "marathi-letter" : "devanagari-shared-by-hindi-and-marathi"],
    };
  }

  if (tally.kana > 0) {
    return { language: "ja", script: "Jpan", mixed, uncertain: false, candidates: ["ja"], romanUrdu: false, signals: ["kana"] };
  }

  if (tally.han > 0 && tally.han >= tally.latin) {
    return { language: "zh", script: "Hani", mixed, uncertain: true, candidates: ["zh-Hans", "zh-Hant"], romanUrdu: false, signals: ["han-script-unspecified"] };
  }

  if (tally.cyrillic > 0 && tally.cyrillic >= tally.latin) {
    const uncertain = /[іїєґ]/.test(text);
    return { language: uncertain ? "und" : "ru", script: "Cyrl", mixed, uncertain, candidates: uncertain ? ["ru", "uk"] : ["ru"], romanUrdu: false, signals: ["cyrillic"] };
  }

  const tokens = tokenize(text);
  const romanHits = tokens.filter((token) => ROMAN_URDU.has(token));
  if (romanHits.length >= 2) {
    return { language: "ur-Latn", script: "Latn", mixed, uncertain: false, candidates: ["ur-Latn"], romanUrdu: true, signals: romanHits };
  }

  const english = scoreWords(text, ["the", "is", "are", "what", "if", "to", "for", "do", "did", "not", "in", "of", "and"]);
  const spanish = scoreWords(text, ["el", "la", "los", "las", "una", "por", "para", "con", "que", "es", "en", "del", "olvide"]) + (/[¿¡ñáéíóú]/i.test(text) ? 2 : 0);
  const french = scoreWords(text, ["le", "les", "des", "est", "pas", "dans", "une", "avec", "qui", "pour"]);

  const ranked = [
    { language: "en", score: english },
    { language: "es", score: spanish },
    { language: "fr", score: french },
  ].sort((a, b) => b.score - a.score);

  if (ranked[0].score >= 2 && ranked[0].score > ranked[1].score) {
    return { language: ranked[0].language, script: "Latn", mixed, uncertain: false, candidates: [ranked[0].language], romanUrdu: false, signals: [ranked[0].language] };
  }

  if (romanHits.length === 1) {
    return { language: "und", script: "Latn", mixed, uncertain: true, candidates: ["ur-Latn", ranked[0].score > 0 ? ranked[0].language : "en"], romanUrdu: true, signals: romanHits };
  }

  return { language: "und", script: tally.latin > 0 ? "Latn" : "Zyyy", mixed, uncertain: true, candidates: ranked.filter((item) => item.score > 0).map((item) => item.language), romanUrdu: false, signals: ["low-confidence"] };
}

export function buildVariants(question: string, detection: Detection): { variants: QueryVariant[]; method: string; model: string | null } {
  const hits = findGlossaryHits(question);
  const variants: QueryVariant[] = [
    { id: "original", kind: "original", language: detection.language, text: question, method: "identity", model: null },
    { id: "normalized", kind: "normalized", language: detection.language, text: normalizeForSearch(question), method: "unicode_search_normalization", model: null },
  ];
  if (hits.length > 0) {
    const arabic = hits.map((hit) => hit.arabic).join(" ");
    const english = hits.map((hit) => hit.preferred.en ?? hit.transliteration).join(" ");
    variants.push({
      id: "glossary-ar",
      kind: "glossary",
      language: "ar",
      text: `${normalizeForSearch(question)} ${arabic}`,
      method: "glossary_terms_only",
      model: null,
    });
    variants.push({
      id: "glossary-en",
      kind: "glossary",
      language: "en",
      text: english,
      method: "glossary_terms_only",
      model: null,
    });
  }
  return { variants, method: hits.length > 0 ? "glossary_terms_only" : "original_only", model: null };
}

const HIGH_STAKES = [
  /talaq/i, /طلاق/, /divorce/i, /divorcio/i, /khula/i, /خلع/,
  /inheritance/i, /mirath/i, /ميراث/, /faraid/i, /فرائض/, /herencia/i,
  /kaffar/i, /كفارة/, /\boath/i, /يمين/, /نذر/,
  /hudud/i, /qisas/i, /قصاص/, /لعان/,
];

export function isHighStakes(question: string): boolean {
  return HIGH_STAKES.some((pattern) => pattern.test(question));
}

export function hasNegation(text: string): boolean {
  if (/\b(not|never|without|sin|tidak|nahi|nahin|nein|pas)\b/i.test(text)) return true;
  return text.split(/\s+/).some((token) => /^(لا|ليس|لم|لن|نہیں|نه)/.test(token));
}
