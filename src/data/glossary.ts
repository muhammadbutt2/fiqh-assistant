export type GlossaryEntry = {
  id: string;
  arabic: string;
  transliteration: string;
  definition: string;
  legalNote: string;
  forms: string[];
  preferred: Record<string, string>;
  leaveUntranslated: boolean;
};

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: "salah",
    arabic: "صلاة",
    transliteration: "salah",
    definition: "The ritual prayer.",
    legalNote: "Schools differ on form, timing, and what affects validity. This entry is not a ruling.",
    forms: ["صلاة", "الصلاة", "نماز", "namaz", "salah", "salat", "salaah", "नमाज़", "नमाज", "নামাজ", "oración"],
    preferred: { en: "ritual prayer (salah)", ur: "نماز", ar: "صلاة", hi: "नमाज़" },
    leaveUntranslated: false,
  },
  {
    id: "tashahhud",
    arabic: "تشهد",
    transliteration: "tashahhud",
    definition: "The testimony recited while sitting in the ritual prayer.",
    legalNote: "Schools differ on the first sitting and on the prostration of forgetfulness. This entry is not a ruling.",
    forms: ["تشهد", "التشهد", "تشہد", "tashahhud", "tashahud", "tashahhod", "तशह्हुद", "তশাহহুদ"],
    preferred: { en: "tashahhud", ar: "التشهد", ur: "تشہد" },
    leaveUntranslated: true,
  },
  {
    id: "rakah",
    arabic: "ركعة",
    transliteration: "rak'ah",
    definition: "One unit of the ritual prayer.",
    legalNote: "The number of units depends on the prayer. This entry is not a ruling.",
    forms: ["ركعة", "ركعات", "rakat", "rakaat", "rakah", "rak'ah"],
    preferred: { en: "rak'ah", ar: "ركعة" },
    leaveUntranslated: true,
  },
  {
    id: "wudu",
    arabic: "وضوء",
    transliteration: "wudu",
    definition: "The ablution performed before prayer.",
    legalNote: "Schools differ on what breaks ablution. This entry is not a ruling.",
    forms: ["وضوء", "wudu", "wudhu", "wuzu", "وضو"],
    preferred: { en: "wudu", ar: "وضوء", ur: "وضو" },
    leaveUntranslated: true,
  },
  {
    id: "wajib",
    arabic: "واجب",
    transliteration: "wajib",
    definition: "A required act. Hanafi usage often distinguishes wajib from fard.",
    legalNote: "Do not treat wajib and fard as synonyms when reporting a Hanafi text.",
    forms: ["واجب", "wajib"],
    preferred: { en: "wajib", ar: "واجب" },
    leaveUntranslated: true,
  },
  {
    id: "fard",
    arabic: "فرض",
    transliteration: "fard",
    definition: "An obligation established at the highest level in Hanafi usage.",
    legalNote: "Other schools may use fard for a duty without the Hanafi wajib/fard split.",
    forms: ["فرض", "fard", "farz"],
    preferred: { en: "fard", ar: "فرض" },
    leaveUntranslated: true,
  },
  {
    id: "sunnah",
    arabic: "سنة",
    transliteration: "sunnah",
    definition: "A prophetic practice. Legal weight differs by school and by the kind of sunnah.",
    legalNote: "Emphasised and non-emphasised sunnah are not the same in Hanafi works.",
    forms: ["سنة", "sunnah", "sunnat"],
    preferred: { en: "sunnah", ar: "سنة" },
    leaveUntranslated: true,
  },
  {
    id: "makruh",
    arabic: "مكروه",
    transliteration: "makruh",
    definition: "Disliked. Some schools distinguish prohibitively disliked from mildly disliked.",
    legalNote: "Do not render makruh as merely 'discouraged' when the text means prohibitively disliked.",
    forms: ["مكروه", "makruh", "makrooh"],
    preferred: { en: "makruh", ar: "مكروه" },
    leaveUntranslated: true,
  },
  {
    id: "mubah",
    arabic: "مباح",
    transliteration: "mubah",
    definition: "Permissible, with neither reward nor blame for the act itself.",
    legalNote: "Permissible is not the same as recommended.",
    forms: ["مباح", "mubah"],
    preferred: { en: "permissible (mubah)", ar: "مباح" },
    leaveUntranslated: false,
  },
  {
    id: "sahih",
    arabic: "صحيح",
    transliteration: "sahih",
    definition: "Valid, when used of an act of worship or a contract.",
    legalNote: "A valid act is not the same as a recommended one.",
    forms: ["صحيح", "sahih"],
    preferred: { en: "valid", ar: "صحيح" },
    leaveUntranslated: false,
  },
  {
    id: "batil",
    arabic: "باطل",
    transliteration: "batil",
    definition: "Invalid.",
    legalNote: "Invalid is not the same as prohibited. An act can be prohibited yet still valid, or invalid for a missing condition.",
    forms: ["باطل", "batil"],
    preferred: { en: "invalid", ar: "باطل" },
    leaveUntranslated: false,
  },
  {
    id: "haram",
    arabic: "حرام",
    transliteration: "haram",
    definition: "Prohibited.",
    legalNote: "Prohibited is not the same as invalid.",
    forms: ["حرام", "haram"],
    preferred: { en: "prohibited", ar: "حرام" },
    leaveUntranslated: false,
  },
];

export function findGlossaryHits(text: string): GlossaryEntry[] {
  const haystack = text.toLowerCase();
  return GLOSSARY.filter((entry) => entry.forms.some((form) => haystack.includes(form.toLowerCase()) || text.includes(form)));
}
