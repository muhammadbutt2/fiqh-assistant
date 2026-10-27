/**
 * Central language registry for this version of Online Mufti.
 *
 * Only three user-facing languages exist: English, Urdu and Arabic.
 * The source books are Arabic and Urdu. English is an input and output language
 * reached through terminology expansion and, when configured, a translation provider.
 * Do not add a language here without a reviewed message bundle in messages.ts.
 */

export type Direction = "ltr" | "rtl";
export type TranslationReliability = "not_required" | "not_validated";
export type SupportedLanguage = "en" | "ur" | "ar";

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ["en", "ur", "ar"] as const;

/** Languages that approved source passages are written in. */
export const SOURCE_LANGUAGES: readonly SupportedLanguage[] = ["ar", "ur"] as const;

export type LanguageDefinition = {
  id: SupportedLanguage;
  englishName: string;
  nativeName: string;
  iso6393: string;
  bcp47: string;
  direction: Direction;
  /** Whether a fixed message in this language has been reviewed by its author or still awaits a native-speaker check. */
  machineTranslation: TranslationReliability;
  font: "ui" | "arabic" | "nastaliq";
  /** Placeholder text for the question box when this language is the chosen response language. */
  questionPlaceholder: string;
  /** Role of the language in retrieval. Source languages are searched directly; English is bridged. */
  retrievalRole: "source" | "bridged";
};

export type LocaleDefinition = LanguageDefinition & {
  localeId: SupportedLanguage;
  languageId: SupportedLanguage;
};

const base: LanguageDefinition[] = [
  {
    id: "en",
    englishName: "English",
    nativeName: "English",
    iso6393: "eng",
    bcp47: "en",
    direction: "ltr",
    machineTranslation: "not_required",
    font: "ui",
    questionPlaceholder: "Describe your masla in your own words. The selected school, not the language, chooses the sources.",
    retrievalRole: "bridged",
  },
  {
    id: "ur",
    englishName: "Urdu",
    nativeName: "اردو",
    iso6393: "urd",
    bcp47: "ur",
    direction: "rtl",
    machineTranslation: "not_validated",
    font: "nastaliq",
    questionPlaceholder: "اپنا مسئلہ اپنے الفاظ میں لکھیں۔ ماخذ کا انتخاب منتخب مذہب کرتا ہے، زبان نہیں۔",
    retrievalRole: "source",
  },
  {
    id: "ar",
    englishName: "Arabic",
    nativeName: "العربية",
    iso6393: "arb",
    bcp47: "ar",
    direction: "rtl",
    machineTranslation: "not_validated",
    font: "arabic",
    questionPlaceholder: "اكتب مسألتك بكلماتك. المذهب الذي اخترته هو الذي يحدد المصادر، لا اللغة.",
    retrievalRole: "source",
  },
];

export function listLanguages(): LanguageDefinition[] {
  return base.map((item) => ({ ...item }));
}

export function listLocales(): LocaleDefinition[] {
  return base.map((language) => ({ ...language, localeId: language.id, languageId: language.id }));
}

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return value === "en" || value === "ur" || value === "ar";
}

export function getLocale(localeId: string): LocaleDefinition | null {
  return listLocales().find((item) => item.localeId === localeId) ?? null;
}

export function requireLocale(localeId: string): LocaleDefinition {
  const locale = getLocale(localeId);
  if (!locale) throw new Error("INVALID_LOCALE");
  return locale;
}

export function directionFor(language: string | null | undefined): Direction {
  if (language === "ar" || language === "ur" || language === "ur-Arab") return "rtl";
  return "ltr";
}

/**
 * Chooses the response language when the user has not saved one.
 * A detected question language is used only when it is one of the supported three.
 * Roman Urdu ("ur-Latn") maps to Urdu. Anything else falls back to English.
 */
export function defaultAnswerLocale(detectedLanguage: string | null | undefined, fallback: SupportedLanguage = "en"): SupportedLanguage {
  if (isSupportedLanguage(detectedLanguage)) return detectedLanguage;
  if (detectedLanguage === "ur-Latn") return "ur";
  return fallback;
}
