import { getLocale, type LocaleDefinition, type SupportedLanguage } from "@/data/languages";

export const NO_EVIDENCE_EN =
  "Reliable supporting evidence was not found in the currently approved sources. The passages discovered so far are not sufficiently verified or relevant to support a dependable answer.";

export const CANDIDATE_EVIDENCE_EN =
  "A matching passage was found in a book for the selected school. It is shown below. It is not approved evidence: the OCR has not been measured against human-checked pages, or rights and verification are still pending. No ruling is issued from it.";

type Bundle = Record<SupportedLanguage, string>;

const noEvidence: Bundle = {
  en: NO_EVIDENCE_EN,
  ur: "منظور شدہ مصادر میں اس سوال کے لیے قابلِ اعتماد دلیل نہیں ملی۔ جو عبارتیں اب تک ملی ہیں وہ اتنے تصدیق شدہ یا متعلق نہیں کہ ان پر بھروسہ مند جواب دیا جا سکے۔",
  ar: "لم يُعثر على دليل موثوق في المصادر المعتمدة حالياً. العبارات التي ظهرت حتى الآن ليست محققة أو ذات صلة بما يكفي لدعم جواب يُعتمد عليه.",
};

const candidateEvidence: Bundle = {
  en: CANDIDATE_EVIDENCE_EN,
  ur: "منتخب مذہب کی ایک کتاب میں مماثل عبارت ملی ہے۔ وہ نیچے دکھائی گئی ہے۔ یہ منظور شدہ دلیل نہیں: او سی آر کی درستگی انسانی حوالہ جات سے نہیں ناپی گئی، یا حقوق اور تصدیق ابھی باقی ہیں۔ اس سے کوئی حکم نہیں نکالا جا رہا۔",
  ar: "وُجدت عبارة مطابقة في كتاب للمذهب المختار. هي معروضة أدناه. ليست دليلاً معتمدًا: لم تُقَس دقة التعرف الضوئي على صفحات راجعها إنسان، أو أن الحقوق والتحقق ما زالا معلّقين. لا يُستخرج منها حكم.",
};

const generationUnavailable: Bundle = {
  en: "A language model is not configured, so the answer quotes the retrieved source instead of writing a longer explanation. No ruling is issued.",
  ur: "زبان کا ماڈل ترتیب نہیں دیا گیا، اس لیے جواب ماخذ کے اقتباس پر منحصر ہے۔ کوئی حکم نہیں دیا جا رہا۔",
  ar: "لم يُضبط نموذج لغوي، ولذلك يعتمد الجواب على اقتباس المصدر المسترجع. لا يُصدر حكم.",
};

const notAMufti: Bundle = {
  en: "This is an AI-assisted research service, not a mufti, and not a substitute for qualified scholarly judgment.",
  ur: "یہ اے آئی کی مدد سے تحقیقی خدمت ہے، مفتی نہیں، اور اہل عالم کے فیصلے کا بدل نہیں۔",
  ar: "هذه خدمة بحث بمساعدة الذكاء الاصطناعي، وليست مفتيًا، ولا تغني عن نظر عالم مؤهَّل.",
};

const extractiveApproved: Bundle = {
  en: "The retrieved approved source addresses this question. The original excerpt is quoted below. This service does not issue a binding ruling.",
  ur: "منظور شدہ ماخذ اس سوال سے متعلق ہے۔ اصل اقتباس نیچے ہے۔ یہ خدمت پابند شرعی حکم صادر نہیں کرتی۔",
  ar: "المصدر المعتمد المسترجع يعالج هذا السؤال. المقتطف الأصلي معروض أدناه. هذه الخدمة لا تُصدر حكمًا ملزمًا.",
};

const extractiveInstitutional: Bundle = {
  en: "An approved institutional article discusses this question. It is a contemporary institutional source, not a quotation from a classical fiqh book, and this service does not issue a ruling from it.",
  ur: "ایک منظور شدہ ادارہ جاتی مضمون اس سوال پر بات کرتا ہے۔ یہ معاصر ادارہ جاتی ماخذ ہے، کلاسیکی فقہی کتاب کا اقتباس نہیں، اور یہ خدمت اس سے حکم صادر نہیں کرتی۔",
  ar: "تناقش مقالة مؤسسية معتمدة هذا السؤال. هي مصدر مؤسسي معاصر وليست اقتباسًا من كتاب فقهي كلاسيكي، ولا تُصدر هذه الخدمة حكمًا منها.",
};

const coverageApproved: Bundle = {
  en: "Approved book evidence for the selected school.",
  ur: "منتخب مذہب کے لیے منظور شدہ کتابی دلیل دستیاب ہے۔",
  ar: "دليل كتابي معتمد للمذهب المختار.",
};

const coverageInstitutional: Bundle = {
  en: "Institutional website evidence only; not a classical quotation.",
  ur: "صرف ادارہ جاتی ویب سائٹ کی دلیل؛ کلاسیکی اقتباس نہیں۔",
  ar: "دليل من موقع مؤسسي فقط؛ وليس اقتباسًا كلاسيكيًا.",
};

const coverageNone: Bundle = {
  en: "No sufficiently verified evidence in the approved sources.",
  ur: "منظور شدہ مصادر میں کافی تصدیق شدہ دلیل نہیں۔",
  ar: "لا يوجد دليل محقق بدرجة كافية في المصادر المعتمدة.",
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
  answerHeading: string;
  explanationHeading: string;
  bookEvidenceHeading: string;
  websiteEvidenceHeading: string;
  conditionsHeading: string;
  differencesHeading: string;
  sourcesHeading: string;
  furtherReviewHeading: string;
  coverageLabel: string;
  relevanceLabel: string;
  suppliedTranslation: string;
  noTranslation: string;
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
    answerHeading: "Answer",
    explanationHeading: "Explanation",
    bookEvidenceHeading: "Evidence from Classical Books",
    websiteEvidenceHeading: "Supporting Institutional Sources",
    conditionsHeading: "Conditions and Important Details",
    differencesHeading: "Differences of Opinion",
    sourcesHeading: "Sources",
    furtherReviewHeading: "Need for Further Review",
    coverageLabel: "Source coverage",
    relevanceLabel: "Why this is relevant",
    suppliedTranslation: "Translation of the quotation (supplied with the record, not generated as a ruling)",
    noTranslation: "No reviewed translation is stored for this passage. The original text is the evidence.",
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
    answerHeading: "جواب",
    explanationHeading: "وضاحت",
    bookEvidenceHeading: "کلاسیکی کتابوں سے دلائل",
    websiteEvidenceHeading: "ادارہ جاتی مصادر",
    conditionsHeading: "شرائط اور اہم تفصیلات",
    differencesHeading: "اختلافِ رائے",
    sourcesHeading: "مصادر",
    furtherReviewHeading: "مزید جائزے کی ضرورت",
    coverageLabel: "ماخذ کی کوریج",
    relevanceLabel: "متعلق کیوں ہے",
    suppliedTranslation: "اقتباس کا ترجمہ (ریکارڈ کے ساتھ محفوظ، حکم نہیں)",
    noTranslation: "اس عبارت کا جائزہ شدہ ترجمہ محفوظ نہیں۔ اصل متن ہی دلیل ہے۔",
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
    answerHeading: "الجواب",
    explanationHeading: "البيان",
    bookEvidenceHeading: "أدلة من الكتب المعتمدة",
    websiteEvidenceHeading: "مصادر المؤسسات المعتمدة",
    conditionsHeading: "الشروط والتفاصيل المهمة",
    differencesHeading: "اختلاف الأقوال",
    sourcesHeading: "المصادر",
    furtherReviewHeading: "الحاجة إلى مزيد من النظر",
    coverageLabel: "تغطية المصادر",
    relevanceLabel: "وجه الصلة",
    suppliedTranslation: "ترجمة الاقتباس (مرفقة بالسجل، وليست حكمًا)",
    noTranslation: "لا توجد ترجمة مراجعة لهذه العبارة. النص الأصلي هو الدليل.",
  },
};

export type Copy = {
  locale: LocaleDefinition;
  noEvidence: string;
  candidateEvidence: string;
  generationUnavailable: string;
  notAMufti: string;
  extractiveApproved: string;
  extractiveInstitutional: string;
  coverageApproved: string;
  coverageInstitutional: string;
  coverageNone: string;
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
    extractiveApproved: extractiveApproved[locale.localeId],
    extractiveInstitutional: extractiveInstitutional[locale.localeId],
    coverageApproved: coverageApproved[locale.localeId],
    coverageInstitutional: coverageInstitutional[locale.localeId],
    coverageNone: coverageNone[locale.localeId],
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
