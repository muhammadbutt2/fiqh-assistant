import { listLanguages } from "@/data/languages";

export type RetrievalSupport = {
  languageId: string;
  detection: "script" | "word-list" | "weak";
  queryTranslation: "source-language" | "terminology-only" | "not-built";
  answerGeneration: "model-if-configured" | "fixed-draft";
  evaluation: "fixture-terminology" | "not-measured";
  limitation: string;
};

const EXTRA: Record<string, Partial<RetrievalSupport>> = {
  en: { detection: "word-list", queryTranslation: "terminology-only", answerGeneration: "model-if-configured", evaluation: "fixture-terminology", limitation: "Whole-sentence Arabic and Urdu translation needs a configured provider. Terminology covers listed fiqh terms only." },
  ar: { detection: "script", queryTranslation: "source-language", answerGeneration: "model-if-configured", evaluation: "fixture-terminology", limitation: "Arabic script without Urdu-specific letters is labelled Arabic. Dialect is not separated from Modern Standard Arabic." },
  ur: { detection: "script", queryTranslation: "source-language", answerGeneration: "model-if-configured", evaluation: "fixture-terminology", limitation: "Urdu is detected from Urdu-specific letters. Roman Urdu is a separate detection path." },
  es: { detection: "word-list", evaluation: "fixture-terminology" },
  fr: { detection: "word-list", evaluation: "fixture-terminology" },
  zh: { detection: "script", evaluation: "fixture-terminology", limitation: "Chinese is detected as Han script. Only listed terms such as 天课 map into Arabic and Urdu search. The rest of the sentence is not translated without a provider." },
  hi: { detection: "script", evaluation: "fixture-terminology", limitation: "Hindi and Marathi share Devanagari. Detection is uncertain unless a Marathi-specific letter is present." },
  ja: { detection: "script", queryTranslation: "not-built", evaluation: "not-measured", limitation: "Japanese script is detected. No Japanese fiqh terminology is mapped, so retrieval falls back to the original wording." },
};

export function retrievalSupport(): RetrievalSupport[] {
  return listLanguages().map((language) => {
    const extra = EXTRA[language.id] ?? {};
    return {
      languageId: language.id,
      detection: extra.detection ?? (language.direction === "rtl" ? "script" : "weak"),
      queryTranslation: extra.queryTranslation ?? "terminology-only",
      answerGeneration: extra.answerGeneration ?? "fixed-draft",
      evaluation: extra.evaluation ?? "not-measured",
      limitation: extra.limitation ?? "No cross-language retrieval evaluation has been run for this language beyond the shared terminology list. Display support is not retrieval quality.",
    };
  });
}
