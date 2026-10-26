export const SPEAKER_RANKING = {
  retrieved: "2026-10-26",
  wikipediaTitle: "List of languages by total number of speakers",
  wikipediaUrl: "https://en.wikipedia.org/wiki/List_of_languages_by_total_number_of_speakers",
  wikipediaSection: "Ethnologue (2026)",
  ethnologueTitle: "What are the top 200 most spoken languages?",
  ethnologueUrl: "https://www.ethnologue.com/insights/ethnologue200",
  ethnologueEditionNote:
    "Wikipedia cites Ethnologue (2026) for this table, with access-date 8 March 2026. A direct request to that Ethnologue URL on 2026-10-26 returned HTTP 403, so the subscriber dataset was not opened.",
  methodology:
    "Total speakers means first-language plus second-language users, rounded to millions on the Wikipedia table. Ethnologue's table excludes macrolanguages, so Arabic is split (Modern Standard Arabic and Egyptian Arabic are separate rows) and Chinese is Mandarin rather than all Sinitic languages. Hindi and Urdu are separate. Displayed totals do not always equal L1 plus L2 because of rounding. Some data-sort-value attributes differ from the displayed millions (English total is displayed as 1,493 while its sort value is 1515). This registry uses the displayed millions. The order is not a religious ranking and is not universally definitive.",
  notDefinitive: true,
  excludedNextRow: {
    englishName: "Turkish",
    iso6393: "tur",
    totalMillions: 94,
    reason:
      "Turkish is the next row and has the same displayed total, 94 million, as Hausa. Wikipedia lists Hausa first, so Turkish is outside this top 20.",
  },
} as const;

export type Direction = "ltr" | "rtl";
export type TranslationReliability = "not_required" | "not_validated" | "insufficient";

export type LanguageDefinition = {
  id: string;
  rank: number;
  englishName: string;
  nativeName: string;
  iso6393: string;
  bcp47: string;
  direction: Direction;
  totalMillions: number;
  l1Millions: number | null;
  l2Millions: number | null;
  machineTranslation: TranslationReliability;
  font: "ui" | "arabic" | "urdu" | "nastaliq" | "devanagari" | "bengali" | "cjk";
};

export type LocaleDefinition = LanguageDefinition & {
  localeId: string;
  languageId: string;
  script?: string;
};

const base: LanguageDefinition[] = [
  { id: "en", rank: 1, englishName: "English", nativeName: "English", iso6393: "eng", bcp47: "en", direction: "ltr", totalMillions: 1493, l1Millions: 372, l2Millions: 1121, machineTranslation: "not_required", font: "ui" },
  { id: "zh", rank: 2, englishName: "Mandarin Chinese", nativeName: "中文", iso6393: "cmn", bcp47: "zh-Hans", direction: "ltr", totalMillions: 1183, l1Millions: 988, l2Millions: 194, machineTranslation: "not_validated", font: "cjk" },
  { id: "hi", rank: 3, englishName: "Hindi", nativeName: "हिन्दी", iso6393: "hin", bcp47: "hi", direction: "ltr", totalMillions: 611, l1Millions: 347, l2Millions: 264, machineTranslation: "not_validated", font: "devanagari" },
  { id: "es", rank: 4, englishName: "Spanish", nativeName: "Español", iso6393: "spa", bcp47: "es", direction: "ltr", totalMillions: 561, l1Millions: 487, l2Millions: 75, machineTranslation: "not_validated", font: "ui" },
  { id: "ar", rank: 5, englishName: "Modern Standard Arabic", nativeName: "العربية", iso6393: "arb", bcp47: "ar", direction: "rtl", totalMillions: 335, l1Millions: 0, l2Millions: 335, machineTranslation: "not_validated", font: "arabic" },
  { id: "fr", rank: 6, englishName: "French", nativeName: "Français", iso6393: "fra", bcp47: "fr", direction: "ltr", totalMillions: 334, l1Millions: 75, l2Millions: 258, machineTranslation: "not_validated", font: "ui" },
  { id: "bn", rank: 7, englishName: "Bengali", nativeName: "বাংলা", iso6393: "ben", bcp47: "bn", direction: "ltr", totalMillions: 274, l1Millions: 234, l2Millions: 43, machineTranslation: "not_validated", font: "bengali" },
  { id: "pt", rank: 8, englishName: "Portuguese", nativeName: "Português", iso6393: "por", bcp47: "pt", direction: "ltr", totalMillions: 269, l1Millions: 252, l2Millions: 18, machineTranslation: "not_validated", font: "ui" },
  { id: "id", rank: 9, englishName: "Indonesian", nativeName: "Bahasa Indonesia", iso6393: "ind", bcp47: "id", direction: "ltr", totalMillions: 255, l1Millions: 78, l2Millions: 177, machineTranslation: "not_validated", font: "ui" },
  { id: "ur", rank: 10, englishName: "Urdu", nativeName: "اردو", iso6393: "urd", bcp47: "ur", direction: "rtl", totalMillions: 246, l1Millions: 78, l2Millions: 168, machineTranslation: "not_validated", font: "nastaliq" },
  { id: "ru", rank: 11, englishName: "Russian", nativeName: "Русский", iso6393: "rus", bcp47: "ru", direction: "ltr", totalMillions: 210, l1Millions: 133, l2Millions: 77, machineTranslation: "not_validated", font: "ui" },
  { id: "de", rank: 12, englishName: "Standard German", nativeName: "Deutsch", iso6393: "deu", bcp47: "de", direction: "ltr", totalMillions: 133, l1Millions: 76, l2Millions: 57, machineTranslation: "not_validated", font: "ui" },
  { id: "ja", rank: 13, englishName: "Japanese", nativeName: "日本語", iso6393: "jpn", bcp47: "ja", direction: "ltr", totalMillions: 126, l1Millions: 124, l2Millions: 2, machineTranslation: "insufficient", font: "cjk" },
  { id: "pcm", rank: 14, englishName: "Nigerian Pidgin", nativeName: "Naijá", iso6393: "pcm", bcp47: "pcm", direction: "ltr", totalMillions: 121, l1Millions: 5, l2Millions: 116, machineTranslation: "insufficient", font: "ui" },
  { id: "arz", rank: 15, englishName: "Egyptian Arabic", nativeName: "العربية المصرية", iso6393: "arz", bcp47: "ar-EG", direction: "rtl", totalMillions: 118, l1Millions: 83, l2Millions: 35, machineTranslation: "insufficient", font: "arabic" },
  { id: "mr", rank: 16, englishName: "Marathi", nativeName: "मराठी", iso6393: "mar", bcp47: "mr", direction: "ltr", totalMillions: 99, l1Millions: 83, l2Millions: 16, machineTranslation: "insufficient", font: "devanagari" },
  { id: "vi", rank: 17, englishName: "Vietnamese", nativeName: "Tiếng Việt", iso6393: "vie", bcp47: "vi", direction: "ltr", totalMillions: 97, l1Millions: 86, l2Millions: 11, machineTranslation: "insufficient", font: "ui" },
  { id: "te", rank: 18, englishName: "Telugu", nativeName: "తెలుగు", iso6393: "tel", bcp47: "te", direction: "ltr", totalMillions: 96, l1Millions: 83, l2Millions: 13, machineTranslation: "insufficient", font: "ui" },
  { id: "sw", rank: 19, englishName: "Swahili", nativeName: "Kiswahili", iso6393: "swh", bcp47: "sw", direction: "ltr", totalMillions: 95, l1Millions: 4, l2Millions: 91, machineTranslation: "insufficient", font: "ui" },
  { id: "ha", rank: 20, englishName: "Hausa", nativeName: "Hausa", iso6393: "hau", bcp47: "ha", direction: "ltr", totalMillions: 94, l1Millions: 58, l2Millions: 36, machineTranslation: "insufficient", font: "ui" },
];

export function listLanguages(): LanguageDefinition[] {
  return base.map((item) => ({ ...item }));
}

export function listLocales(): LocaleDefinition[] {
  const locales: LocaleDefinition[] = [];
  for (const language of base) {
    if (language.id === "zh") {
      locales.push({
        ...language,
        localeId: "zh-Hans",
        languageId: "zh",
        script: "Hans",
        bcp47: "zh-Hans",
        nativeName: "简体中文",
        englishName: "Mandarin Chinese (Simplified)",
      });
      locales.push({
        ...language,
        localeId: "zh-Hant",
        languageId: "zh",
        script: "Hant",
        bcp47: "zh-Hant",
        nativeName: "繁體中文",
        englishName: "Mandarin Chinese (Traditional)",
      });
    } else {
      locales.push({ ...language, localeId: language.bcp47, languageId: language.id });
    }
  }
  return locales;
}

export function getLocale(localeId: string): LocaleDefinition | null {
  return listLocales().find((item) => item.localeId === localeId) ?? null;
}

export function requireLocale(localeId: string): LocaleDefinition {
  const locale = getLocale(localeId);
  if (!locale) throw new Error("INVALID_LOCALE");
  return locale;
}
