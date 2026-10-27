import { listLanguages, type SupportedLanguage } from "@/data/languages";

export type RetrievalSupport = {
  languageId: SupportedLanguage;
  role: "source" | "bridged";
  detection: "script" | "word-list";
  queryTranslation: "source-language" | "terminology-only" | "provider-when-configured";
  answerGeneration: "model-if-configured";
  evaluation: "fixture-terminology" | "not-measured";
  limitation: string;
};

const DETAIL: Record<SupportedLanguage, Omit<RetrievalSupport, "languageId" | "role">> = {
  en: {
    detection: "word-list",
    queryTranslation: "terminology-only",
    answerGeneration: "model-if-configured",
    evaluation: "fixture-terminology",
    limitation: "English is bridged into Arabic and Urdu through the terminology registry. Whole-sentence translation needs a configured provider. Measured on synthetic fixtures only, not on a real book.",
  },
  ur: {
    detection: "script",
    queryTranslation: "source-language",
    answerGeneration: "model-if-configured",
    evaluation: "fixture-terminology",
    limitation: "Urdu script is searched directly. The Arabic query is terminology unless a provider is configured. Roman Urdu is detected separately and maps only registry terms into Urdu script.",
  },
  ar: {
    detection: "script",
    queryTranslation: "source-language",
    answerGeneration: "model-if-configured",
    evaluation: "fixture-terminology",
    limitation: "Arabic script is searched directly. The Urdu query is terminology unless a provider is configured. Dialect is not separated from Modern Standard Arabic.",
  },
};

export function retrievalSupport(): RetrievalSupport[] {
  return listLanguages().map((language) => ({
    languageId: language.id,
    role: language.retrievalRole,
    ...DETAIL[language.id],
  }));
}
