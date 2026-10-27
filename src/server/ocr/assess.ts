export const ASSESS_VERSION = "assess-v1";

export type Script = "arabic" | "latin";

export type Assessment = {
  verdict: "usable" | "absent" | "unusable";
  reason: string;
  characters: number;
  scriptRatio: number;
  stopwordRate: number | null;
  replacementRatio: number;
  symbolRatio: number;
};

export const ASSESS_LIMITS = {
  minCharacters: 40,
  minScriptRatio: 0.7,
  maxReplacementRatio: 0.02,
  maxSymbolRatio: 0.45,
  minStopwordRate: 0.015,
  minTokensForStopwords: 30,
} as const;

const ARABIC_LETTER = /[\u0621-\u064A\u066E-\u06D3\u06D5\u06FA-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/;

const ARABIC_STOPWORDS = new Set([
  "من", "في", "على", "أن", "إن", "لا", "ما", "إلى", "عن", "هذا", "هذه", "الله", "قال", "لم", "إذا", "كان", "ثم", "أو", "لو", "ذلك", "فيه", "به", "له", "وهو", "فهو", "لأن", "عند", "كل", "بعد",
  "کے", "کی", "کا", "میں", "سے", "کو", "ہے", "اور", "نہ", "یہ", "جو", "ہیں", "پر", "کہ", "نے", "بھی", "تو", "ہو", "اس", "وہ", "ہی", "کر",
]);
const LATIN_STOPWORDS = new Set(["the", "and", "of", "to", "in", "is", "that", "it", "for", "on", "with", "as", "was", "are", "this", "be", "or", "by"]);

export function scriptForLanguage(language: string): Script {
  const code = language.toLowerCase().split(/[+_-]/)[0] ?? "";
  return ["ar", "ara", "ur", "urd", "fa", "fas", "pes", "ps", "pus"].includes(code) ? "arabic" : "latin";
}

export function assessText(text: string, expected: Script): Assessment {
  const compact = text.replace(/\s+/g, "");
  const characters = Array.from(compact).length;
  if (characters < ASSESS_LIMITS.minCharacters) {
    return { verdict: "absent", reason: `fewer than ${ASSESS_LIMITS.minCharacters} non-space characters`, characters, scriptRatio: 0, stopwordRate: null, replacementRatio: 0, symbolRatio: 0 };
  }
  let letters = 0;
  let scriptLetters = 0;
  let replacements = 0;
  let symbols = 0;
  const letterTest = expected === "arabic" ? ARABIC_LETTER : LATIN_LETTER;
  for (const char of compact) {
    if (char === "\uFFFD") replacements++;
    if (/\p{L}/u.test(char)) {
      letters++;
      if (letterTest.test(char)) scriptLetters++;
    } else if (!/\p{N}/u.test(char) && !/\p{M}/u.test(char)) symbols++;
  }
  const scriptRatio = letters === 0 ? 0 : scriptLetters / letters;
  const replacementRatio = replacements / characters;
  const symbolRatio = symbols / characters;
  const tokens = text.split(/[^\p{L}\p{M}]+/u).filter(Boolean);
  const stopwords = expected === "arabic" ? ARABIC_STOPWORDS : LATIN_STOPWORDS;
  const hits = tokens.filter((token) => stopwords.has(expected === "latin" ? token.toLowerCase() : token.replace(/[\u064B-\u065F\u0670]/g, ""))).length;
  const stopwordRate = tokens.length >= ASSESS_LIMITS.minTokensForStopwords ? hits / tokens.length : null;
  const base = { characters, scriptRatio, stopwordRate, replacementRatio, symbolRatio };

  if (scriptRatio < ASSESS_LIMITS.minScriptRatio) {
    return { verdict: "unusable", reason: `only ${(scriptRatio * 100).toFixed(0)}% of letters are in the expected ${expected} script`, ...base };
  }
  if (replacementRatio > ASSESS_LIMITS.maxReplacementRatio) {
    return { verdict: "unusable", reason: "contains many replacement characters", ...base };
  }
  if (symbolRatio > ASSESS_LIMITS.maxSymbolRatio) {
    return { verdict: "unusable", reason: "mostly punctuation or symbols", ...base };
  }
  if (stopwordRate !== null && stopwordRate < ASSESS_LIMITS.minStopwordRate) {
    return { verdict: "unusable", reason: `common-word rate ${(stopwordRate * 100).toFixed(1)}% is below ${(ASSESS_LIMITS.minStopwordRate * 100).toFixed(1)}%, which suggests garbled text`, ...base };
  }
  return { verdict: "usable", reason: "passes script, symbol, and common-word checks", ...base };
}
