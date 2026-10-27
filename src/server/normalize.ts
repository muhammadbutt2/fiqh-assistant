const HARAKAT = /[\u064B-\u0652\u0670\u0640\u06D6-\u06ED]/g;

/**
 * Search normalization shared by the terminology registry, query processing and retrieval.
 * It folds Arabic and Urdu letter variants and digit forms so that a query and a passage
 * written with different conventions still match. It never replaces stored source text.
 */
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

export function hasArabicScript(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}
