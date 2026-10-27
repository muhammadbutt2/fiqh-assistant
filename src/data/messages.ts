import { getLocale, type LocaleDefinition, type SupportedLanguage } from "@/data/languages";

export const NO_EVIDENCE_EN =
  "We could not locate a sufficiently reliable source for this question in the currently indexed material for your selected madhhab. We do not want to guess or present an unsupported religious ruling. Please consult a qualified mufti.";

export const CANDIDATE_EVIDENCE_EN =
  "A matching passage was found in a book for the selected school. It is shown below. It is not approved evidence: the OCR has not been measured against human-checked pages, or rights and verification are still pending. No ruling is issued from it.";

type Bundle = Record<SupportedLanguage, string>;

const noEvidence: Bundle = {
  en: NO_EVIDENCE_EN,
  ur: "آپ کے منتخب مذہب کے موجودہ انڈیکس شدہ مواد میں اس سوال کے لیے کافی قابلِ اعتماد ماخذ نہیں ملا۔ ہم اندازہ لگانا یا بغیر سند کے شرعی حکم پیش نہیں کرنا چاہتے۔ براہِ کرم کسی اہل مفتی سے رجوع کریں۔",
  ar: "لم نعثر على مصدر موثوق بدرجة كافية لهذا السؤال في المادة المفهرسة حاليًا للمذهب الذي اخترته. لا نريد أن نخمّن أو أن نقدّم حكمًا شرعيًا بلا مستند. يُرجى مراجعة مفتٍ مؤهَّل.",
};

const candidateEvidence: Bundle = {
  en: CANDIDATE_EVIDENCE_EN,
  ur: "منتخب مذہب کی ایک کتاب میں مماثل عبارت ملی ہے۔ وہ نیچے دکھائی گئی ہے۔ یہ منظور شدہ دلیل نہیں: او سی آر کی درستگی انسانی حوالہ جات سے نہیں ناپی گئی، یا حقوق اور تصدیق ابھی باقی ہیں۔ اس سے کوئی حکم نہیں نکالا جا رہا۔",
  ar: "وُجدت عبارة مطابقة في كتاب للمذهب المختار. هي معروضة أدناه. ليست دليلاً معتمدًا: لم تُقَس دقة التعرف الضوئي على صفحات راجعها إنسان، أو أن الحقوق والتحقق ما زالا معلّقين. لا يُستخرج منها حكم.",
};

const generationUnavailable: Bundle = {
  en: "A language model is not configured, so no ruling is issued. Text shown as a source excerpt is a quotation from the index, not a fatwa from this service.",
  ur: "زبان کا ماڈل ترتیب نہیں دیا گیا، اس لیے کوئی حکم نہیں دیا جا رہا۔ اقتباس کے طور پر دکھایا گیا متن انڈیکس سے نقل ہے، اس خدمت کا فتوی نہیں۔",
  ar: "لم يُضبط نموذج لغوي، ولذلك لا يُصدر حكم. النص المعروض كمقتطف هو نقل من الفهرس، وليس فتوى من هذه الخدمة.",
};

const notAMufti: Bundle = {
  en: "This is an AI-assisted research service, not a mufti, and not a substitute for qualified scholarly judgment.",
  ur: "یہ اے آئی کی مدد سے تحقیقی خدمت ہے، مفتی نہیں، اور اہل عالم کے فیصلے کا بدل نہیں۔",
  ar: "هذه خدمة بحث بمساعدة الذكاء الاصطناعي، وليست مفتيًا، ولا تغني عن نظر عالم مؤهَّل.",
};

/** Short interface labels. Kept here so the three languages stay in one place. */
export type UiStrings = {
  answerLanguage: string;
  question: string;
  findAnswer: string;
  searching: string;
  cancel: string;
  retry: string;
  selectedSchool: string;
  copyAnswer: string;
  originalExcerpt: string;
  translation: string;
  references: string;
  limitations: string;
};

const ui: Record<SupportedLanguage, UiStrings> = {
  en: {
    answerLanguage: "Answer language",
    question: "Question",
    findAnswer: "Find Answer",
    searching: "Searching",
    cancel: "Cancel",
    retry: "Retry",
    selectedSchool: "Selected school",
    copyAnswer: "Copy answer",
    originalExcerpt: "Original source excerpt",
    translation: "Translation",
    references: "References",
    limitations: "Limitations",
  },
  ur: {
    answerLanguage: "جواب کی زبان",
    question: "سوال",
    findAnswer: "جواب تلاش کریں",
    searching: "تلاش جاری ہے",
    cancel: "منسوخ کریں",
    retry: "دوبارہ کوشش کریں",
    selectedSchool: "منتخب مذہب",
    copyAnswer: "جواب نقل کریں",
    originalExcerpt: "اصل ماخذ کا اقتباس",
    translation: "ترجمہ",
    references: "حوالہ جات",
    limitations: "حدود",
  },
  ar: {
    answerLanguage: "لغة الجواب",
    question: "السؤال",
    findAnswer: "ابحث عن الجواب",
    searching: "جارٍ البحث",
    cancel: "إلغاء",
    retry: "إعادة المحاولة",
    selectedSchool: "المذهب المختار",
    copyAnswer: "نسخ الجواب",
    originalExcerpt: "مقتطف من المصدر الأصلي",
    translation: "الترجمة",
    references: "المراجع",
    limitations: "القيود",
  },
};

export type Copy = {
  locale: LocaleDefinition;
  noEvidence: string;
  candidateEvidence: string;
  generationUnavailable: string;
  notAMufti: string;
  ui: UiStrings;
  nativeReview: "author" | "pending";
  canonicalEnglish: string | null;
};

export function getCopy(localeId: string): Copy {
  const locale = getLocale(localeId);
  if (!locale) throw new Error("INVALID_LOCALE");
  const review = locale.localeId === "en" ? "author" : "pending";
  return {
    locale,
    noEvidence: noEvidence[locale.localeId],
    candidateEvidence: candidateEvidence[locale.localeId],
    generationUnavailable: generationUnavailable[locale.localeId],
    notAMufti: notAMufti[locale.localeId],
    ui: ui[locale.localeId],
    nativeReview: review,
    canonicalEnglish: review === "pending" ? NO_EVIDENCE_EN : null,
  };
}

export function uiStrings(localeId: string | null | undefined): UiStrings {
  const id = getLocale(localeId ?? "en")?.localeId ?? "en";
  return ui[id];
}

export function messageLocales(): string[] {
  return Object.keys(noEvidence);
}
