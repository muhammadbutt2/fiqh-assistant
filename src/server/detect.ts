import { tokenize } from "@/server/normalize";
import type { Detection } from "@/server/types";

/**
 * Question-language detection for the three supported languages.
 * Labels: "ar", "ur", "en", "ur-Latn" (Roman Urdu, treated as Urdu for the answer language),
 * and "und" when the text gives no usable signal. Detection never blocks a search.
 */

const ROMAN_URDU = new Set([
  "mein", "main", "kya", "kyun", "kyon", "hai", "hain", "hoon", "hun", "namaz", "karun", "karoon", "kare",
  "bhool", "bhul", "gaya", "gayi", "nahi", "nahin", "rakat", "rakaat", "wuzu", "wudhu", "roza", "roze",
  "meri", "mera", "mere", "hamari", "humari", "wajib", "farz", "jaiz", "zaroori", "par", "ka", "ki", "ke",
  "agar", "toh", "kaise", "kab", "kitni", "kitna", "paise", "paisa", "raqam", "sona", "chandi", "shadi",
]);

const URDU_LETTERS = /[\u0679\u0688\u0691\u06BA\u06BE\u06C1\u06C2\u06C3\u06CC\u06D2\u06D3\u06A9\u06AF\u0686\u067E\u0698]/;
const URDU_WORDS = new Set(["ہے", "ہیں", "کیا", "میں", "کا", "کی", "کے", "پر", "سے", "اور", "نہیں", "ہو", "تو", "اگر", "جب"]);
const ARABIC_WORDS = new Set(["هل", "في", "من", "على", "عن", "إذا", "اذا", "لا", "ما", "التي", "الذي", "ان", "أن", "هذا", "هذه", "ثم", "او", "أو"]);
const ENGLISH_WORDS = ["the", "is", "are", "was", "what", "if", "to", "for", "do", "did", "does", "not", "in", "of", "and", "my", "i", "on", "have", "can", "it", "a", "an", "be", "or"];

type Tally = { arabic: number; latin: number; other: number };

function counts(text: string): Tally {
  const tally: Tally = { arabic: 0, latin: 0, other: 0 };
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f) || (code >= 0xfb50 && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfeff)) tally.arabic += 1;
    else if ((code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a) || (code >= 0x00c0 && code <= 0x024f)) tally.latin += 1;
    else if (/\p{L}/u.test(char)) tally.other += 1;
  }
  return tally;
}

function rawWords(text: string): string[] {
  return text.normalize("NFC").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export type DetectionWithConfidence = Detection & { confidence: "high" | "medium" | "low" };

export function detectLanguage(text: string): DetectionWithConfidence {
  const tally = counts(text);
  const scripts = [tally.arabic > 0 ? "Arab" : null, tally.latin > 0 ? "Latn" : null, tally.other > 0 ? "Other" : null].filter(Boolean);
  const mixed = scripts.length > 1;
  const words = rawWords(text);

  if (tally.arabic > 0 && tally.arabic >= tally.latin) {
    const urduLetters = URDU_LETTERS.test(text);
    const urduWords = words.filter((word) => URDU_WORDS.has(word)).length;
    const arabicWords = words.filter((word) => ARABIC_WORDS.has(word)).length;
    const urdu = urduLetters || urduWords > arabicWords;
    const signals = ["arabic-script"];
    if (urduLetters) signals.push("urdu-letters");
    if (urduWords > 0) signals.push("urdu-function-words");
    if (arabicWords > 0) signals.push("arabic-function-words");
    const uncertain = !urduLetters && urduWords === 0 && arabicWords === 0 && words.length < 3;
    return {
      language: urdu ? "ur" : "ar",
      script: "Arab",
      mixed,
      uncertain,
      candidates: urdu ? ["ur"] : uncertain ? ["ar", "ur"] : ["ar"],
      romanUrdu: false,
      signals,
      confidence: uncertain ? "medium" : "high",
    };
  }

  if (tally.other > 0 && tally.other > tally.latin) {
    return { language: "und", script: "Zyyy", mixed, uncertain: true, candidates: [], romanUrdu: false, signals: ["unsupported-script"], confidence: "low" };
  }

  const tokens = tokenize(text);
  const romanHits = tokens.filter((token) => ROMAN_URDU.has(token));
  const englishHits = tokens.filter((token) => ENGLISH_WORDS.includes(token));
  // "main" is both English and Roman Urdu; weigh the Roman Urdu reading only when other Roman Urdu words support it.
  const romanScore = romanHits.filter((token) => token !== "main" && token !== "par" && token !== "ka" && token !== "ki" && token !== "ke").length;
  if (romanScore >= 2 && romanScore >= englishHits.length) {
    return { language: "ur-Latn", script: "Latn", mixed, uncertain: false, candidates: ["ur-Latn"], romanUrdu: true, signals: romanHits, confidence: "medium" };
  }
  if (englishHits.length >= 2) {
    return { language: "en", script: "Latn", mixed, uncertain: false, candidates: ["en"], romanUrdu: false, signals: ["english-function-words"], confidence: "medium" };
  }
  if (romanScore === 1 || (romanHits.length >= 1 && englishHits.length === 0)) {
    return { language: "und", script: "Latn", mixed, uncertain: true, candidates: ["ur-Latn", "en"], romanUrdu: true, signals: romanHits, confidence: "low" };
  }
  if (tally.latin > 0) {
    return { language: "en", script: "Latn", mixed, uncertain: true, candidates: ["en", "ur-Latn"], romanUrdu: false, signals: ["latin-script-few-function-words"], confidence: "low" };
  }
  return { language: "und", script: "Zyyy", mixed, uncertain: true, candidates: [], romanUrdu: false, signals: ["low-confidence"], confidence: "low" };
}

const HIGH_STAKES = [
  /\btalaq\b/i, /طلاق/, /\bdivorc/i, /\bkhula\b/i, /خلع/, /\bfaskh\b/i,
  /\binherit/i, /\bmirath\b/i, /ميراث/, /میراث/, /وراثت/, /\bfara'?id\b/i, /فرائض/, /ترکہ/, /تركة/,
  /\bkaffar/i, /كفارة/, /کفارہ/, /\boaths?\b/i, /\bswore\b/i, /\bswear\b/i, /يمين/, /قسم کھا/, /\bvow(ed)?\b/i, /نذر/, /منت/,
  /\bhudud\b/i, /\bqisas\b/i, /قصاص/, /لعان/, /\bzihar\b/i, /ظهار/, /\bapostas/i, /ارتداد/, /مرتد/,
];

export function isHighStakes(question: string): boolean {
  return HIGH_STAKES.some((pattern) => pattern.test(question));
}

const NEGATION_LATIN = /\b(not|never|without|cannot|can't|don't|doesn't|didn't|isn't|aren't|wasn't|won't|nahi|nahin|baghair)\b/i;
const NEGATION_ARABIC = /^(لا|ليس|ليست|لم|لن|بلا|بدون|نہیں|نہ|مت|بغیر|لا(?:يجوز|تجوز|يجب|تجب|يصح|تصح|بأس))$/;

export function hasNegation(text: string): boolean {
  if (NEGATION_LATIN.test(text)) return true;
  return rawWords(text).some((word) => NEGATION_ARABIC.test(word));
}

export function negationWords(text: string): string[] {
  const latin = Array.from(text.matchAll(new RegExp(NEGATION_LATIN.source, "gi")), (match) => match[0]);
  const arabic = rawWords(text).filter((word) => NEGATION_ARABIC.test(word));
  return unique([...latin, ...arabic]);
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}
