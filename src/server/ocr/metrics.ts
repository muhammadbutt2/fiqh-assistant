import { GLOSSARY } from "@/data/glossary";

export type MetricMode = "strict" | "folded";

export type PairMetrics = {
  mode: MetricMode;
  referenceChars: number;
  hypothesisChars: number;
  charEdits: number;
  cer: number;
  referenceWords: number;
  wordEdits: number;
  wer: number;
  criticalReferenceTokens: number;
  criticalErrors: number;
  criticalErrorRate: number;
};

const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

// Strict mode: NFC, invisible bidi marks removed, whitespace collapsed. Nothing else changes.
export function strictForm(text: string): string {
  return text.normalize("NFC").replace(/\r\n?/g, "\n").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

// Folded mode, for reporting only: removes harakat and tatweel, unifies alef, yeh, kaf, heh and digit forms.
export function foldedForm(text: string): string {
  return strictForm(text)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/[\u0649\u06CC\u06D2]/g, "\u064A")
    .replace(/\u06A9/g, "\u0643")
    .replace(/[\u06BE\u06C1\u06C3]/g, "\u0647")
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

export function editDistance<T>(a: readonly T[], b: readonly T[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min((previous[j] as number) + 1, (current[j - 1] as number) + 1, (previous[j - 1] as number) + cost);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length] as number;
}

type Op = "match" | "sub" | "del" | "ins";

export function alignTokens(reference: readonly string[], hypothesis: readonly string[]): { ref: string | null; hyp: string | null; op: Op }[] {
  const rows = reference.length + 1;
  const cols = hypothesis.length + 1;
  const table = new Int32Array(rows * cols);
  for (let i = 0; i < rows; i++) table[i * cols] = i;
  for (let j = 0; j < cols; j++) table[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = reference[i - 1] === hypothesis[j - 1] ? 0 : 1;
      table[i * cols + j] = Math.min(
        (table[(i - 1) * cols + j] as number) + 1,
        (table[i * cols + j - 1] as number) + 1,
        (table[(i - 1) * cols + j - 1] as number) + cost,
      );
    }
  }
  const ops: { ref: string | null; hyp: string | null; op: Op }[] = [];
  let i = reference.length;
  let j = hypothesis.length;
  while (i > 0 || j > 0) {
    const here = table[i * cols + j] as number;
    if (i > 0 && j > 0 && here === (table[(i - 1) * cols + j - 1] as number) + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1)) {
      ops.push({ ref: reference[i - 1] as string, hyp: hypothesis[j - 1] as string, op: reference[i - 1] === hypothesis[j - 1] ? "match" : "sub" });
      i--;
      j--;
    } else if (i > 0 && here === (table[(i - 1) * cols + j] as number) + 1) {
      ops.push({ ref: reference[i - 1] as string, hyp: null, op: "del" });
      i--;
    } else {
      ops.push({ ref: null, hyp: hypothesis[j - 1] as string, op: "ins" });
      j--;
    }
  }
  return ops.reverse();
}

const NEGATION_AND_EXCEPTION = [
  "لا", "لم", "لن", "ليس", "ليست", "غير", "بلا", "إلا", "الا", "ما", "نهى", "يحرم", "حرام", "يجوز", "لايجوز",
  "نہ", "نہیں", "مت", "بغیر", "سوا", "حرام", "جائز", "ناجائز",
];

function criticalSet(mode: MetricMode): Set<string> {
  const terms = new Set<string>(NEGATION_AND_EXCEPTION);
  for (const entry of GLOSSARY) {
    for (const form of [entry.arabic, ...entry.forms, ...Object.values(entry.preferred)]) {
      if (/[\u0600-\u06FF]/.test(form) && !/\s/.test(form)) terms.add(form);
    }
  }
  return new Set(Array.from(terms, (term) => (mode === "folded" ? foldedForm(term) : strictForm(term))));
}

const CRITICAL_CACHE = new Map<MetricMode, Set<string>>();

function isCritical(token: string, mode: MetricMode): boolean {
  if (/[\d\u0660-\u0669\u06F0-\u06F9]/.test(token)) return true;
  let set = CRITICAL_CACHE.get(mode);
  if (!set) {
    set = criticalSet(mode);
    CRITICAL_CACHE.set(mode, set);
  }
  return set.has(token);
}

function words(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ""))
    .filter(Boolean);
}

export function evaluatePair(reference: string, hypothesis: string, mode: MetricMode): PairMetrics {
  const fold = mode === "folded" ? foldedForm : strictForm;
  const ref = fold(reference);
  const hyp = fold(hypothesis);
  const refChars = Array.from(ref);
  const hypChars = Array.from(hyp);
  const charEdits = editDistance(refChars, hypChars);
  const refWords = words(ref);
  const hypWords = words(hyp);
  const ops = alignTokens(refWords, hypWords);
  const wordEdits = ops.filter((item) => item.op !== "match").length;
  let criticalReferenceTokens = 0;
  let criticalErrors = 0;
  for (const item of ops) {
    if (item.ref !== null && isCritical(item.ref, mode)) {
      criticalReferenceTokens++;
      if (item.op !== "match") criticalErrors++;
    } else if (item.op === "ins" && item.hyp !== null && isCritical(item.hyp, mode)) {
      criticalErrors++;
    }
  }
  return {
    mode,
    referenceChars: refChars.length,
    hypothesisChars: hypChars.length,
    charEdits,
    cer: refChars.length === 0 ? (hypChars.length === 0 ? 0 : 1) : charEdits / refChars.length,
    referenceWords: refWords.length,
    wordEdits,
    wer: refWords.length === 0 ? (hypWords.length === 0 ? 0 : 1) : wordEdits / refWords.length,
    criticalReferenceTokens,
    criticalErrors,
    criticalErrorRate: criticalErrors / Math.max(criticalReferenceTokens, 1),
  };
}

export function aggregateMetrics(items: PairMetrics[], mode: MetricMode): PairMetrics {
  const sum = (pick: (item: PairMetrics) => number) => items.reduce((total, item) => total + pick(item), 0);
  const referenceChars = sum((item) => item.referenceChars);
  const referenceWords = sum((item) => item.referenceWords);
  const critical = sum((item) => item.criticalReferenceTokens);
  const charEdits = sum((item) => item.charEdits);
  const wordEdits = sum((item) => item.wordEdits);
  const criticalErrors = sum((item) => item.criticalErrors);
  return {
    mode,
    referenceChars,
    hypothesisChars: sum((item) => item.hypothesisChars),
    charEdits,
    cer: referenceChars === 0 ? 0 : charEdits / referenceChars,
    referenceWords,
    wordEdits,
    wer: referenceWords === 0 ? 0 : wordEdits / referenceWords,
    criticalReferenceTokens: critical,
    criticalErrors,
    criticalErrorRate: criticalErrors / Math.max(critical, 1),
  };
}
