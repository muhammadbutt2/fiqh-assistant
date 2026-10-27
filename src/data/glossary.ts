import { normalizeForSearch, tokenize } from "@/server/normalize";

/**
 * Arabic / Urdu / English fiqh terminology registry.
 *
 * Each concept carries its canonical term in the three supported languages, the written
 * variants that should be recognised in a question, and the Arabic and Urdu strings that
 * are safe to use as *search terms*. These strings are retrieval aids. They are not a
 * translation of a whole question and never a ruling. `relatedDistinct` lists concepts
 * that look similar but must not be substituted for each other.
 */
export type ConceptCategory =
  | "worship"
  | "purification"
  | "legal_category"
  | "finance"
  | "family"
  | "oaths"
  | "question_intent";

export type ConceptContext = {
  id: string;
  /** Tested against the original question. */
  match: RegExp;
  ar: string[];
  ur: string[];
  note: string;
};

export type Concept = {
  id: string;
  category: ConceptCategory;
  en: string;
  ar: string;
  ur: string;
  arVariants: string[];
  urVariants: string[];
  enExpressions: string[];
  transliterations: string[];
  /** Extra Arabic and Urdu strings used only as search queries. */
  searchPhrases?: { ar?: string[]; ur?: string[] };
  /** Context-sensitive search phrases, for example zakat + savings. */
  contexts?: ConceptContext[];
  relatedDistinct: string[];
  note: string;
  /** Keep the technical term in an English answer rather than paraphrasing it away. */
  leaveUntranslated: boolean;
};

/** Back-compat view used by OCR metrics and older callers. */
export type GlossaryEntry = Concept & {
  arabic: string;
  transliteration: string;
  forms: string[];
  preferred: { en: string; ar: string; ur: string };
  legalNote: string;
};

const concept = (c: Concept): Concept => c;

export const CONCEPTS: Concept[] = [
  concept({
    id: "salah", category: "worship", en: "ritual prayer (salah)", ar: "صلاة", ur: "نماز",
    arVariants: ["الصلاة", "صلوات", "يصلي", "صلى"], urVariants: ["نمازیں", "نماز پڑھ"],
    enExpressions: ["prayer", "prayers", "pray"], transliterations: ["salah", "salat", "salaah", "namaz", "namaaz", "solat"],
    relatedDistinct: ["dua"],
    note: "Schools differ on form, timing and what affects validity. A match is a topic, not a ruling.",
    leaveUntranslated: false,
  }),
  concept({
    id: "dua", category: "worship", en: "supplication (dua)", ar: "دعاء", ur: "دعا",
    arVariants: ["الدعاء", "أدعية"], urVariants: ["دعائیں"],
    enExpressions: ["supplication"], transliterations: ["dua", "du'a", "duaa"],
    relatedDistinct: ["salah"],
    note: "Supplication is not the ritual prayer.",
    leaveUntranslated: true,
  }),
  concept({
    id: "tashahhud", category: "worship", en: "tashahhud", ar: "التشهد", ur: "تشہد",
    arVariants: ["تشهد", "القعدة"], urVariants: ["قعدہ"],
    enExpressions: ["sitting testimony"], transliterations: ["tashahhud", "tashahud", "tashahhod", "attahiyat", "attahiyyat"],
    relatedDistinct: [],
    note: "Schools differ on the first sitting and on the prostration of forgetfulness.",
    leaveUntranslated: true,
  }),
  concept({
    id: "rakah", category: "worship", en: "rak'ah", ar: "ركعة", ur: "رکعت",
    arVariants: ["ركعات", "ركعتين", "الركعة"], urVariants: ["رکعتیں", "رکعات"],
    enExpressions: ["unit of prayer"], transliterations: ["rakat", "rakaat", "rakah", "rak'ah", "rakah"],
    relatedDistinct: [],
    note: "The number of units depends on the prayer.",
    leaveUntranslated: true,
  }),
  concept({
    id: "sajda_sahw", category: "worship", en: "prostration of forgetfulness (sajdat al-sahw)", ar: "سجود السهو", ur: "سجدہ سہو",
    arVariants: ["سجدتي السهو", "السهو"], urVariants: ["سجدۂ سہو", "سہو"],
    enExpressions: ["forgot in prayer", "forgot during prayer", "forgetfulness in prayer", "forgot the tashahhud", "forgot a rakat", "forgot to recite"], transliterations: ["sajda sahw", "sajdah sahw", "sajda-e-sahw", "sahw"],
    relatedDistinct: [],
    note: "Triggered when a question says something was forgotten in prayer. Which omissions require it differs by school.",
    leaveUntranslated: true,
  }),
  concept({
    id: "wudu", category: "purification", en: "wudu", ar: "وضوء", ur: "وضو",
    arVariants: ["الوضوء", "يتوضأ", "توضأ"], urVariants: ["وضو ٹوٹ"],
    enExpressions: ["ablution"], transliterations: ["wudu", "wudhu", "wuzu", "wudoo", "wuduk"],
    relatedDistinct: ["ghusl", "tayammum"],
    note: "Schools differ on what breaks ablution. Not the same as ghusl.",
    leaveUntranslated: true,
  }),
  concept({
    id: "ghusl", category: "purification", en: "ghusl", ar: "غسل", ur: "غسل",
    arVariants: ["الغسل", "يغتسل", "اغتسل"], urVariants: ["غسل واجب"],
    enExpressions: ["ritual bath", "full bath"], transliterations: ["ghusl", "ghusal"],
    relatedDistinct: ["wudu"],
    note: "Ghusl is not the same as wudu.",
    leaveUntranslated: true,
  }),
  concept({
    id: "tayammum", category: "purification", en: "tayammum", ar: "تيمم", ur: "تیمم",
    arVariants: ["التيمم", "يتيمم"], urVariants: [],
    enExpressions: ["dry ablution"], transliterations: ["tayammum", "tayamum"],
    relatedDistinct: ["wudu"],
    note: "Dry ablution has its own conditions.",
    leaveUntranslated: true,
  }),
  concept({
    id: "taharah", category: "purification", en: "ritual purity (taharah)", ar: "طهارة", ur: "طہارت",
    arVariants: ["الطهارة", "طاهر", "نجاسة", "النجاسة", "نجس"], urVariants: ["پاکی", "ناپاک", "ناپاکی", "نجاست"],
    enExpressions: ["purity", "impurity", "impure", "najasah", "najis"], transliterations: ["taharah", "tahara", "najasa", "najasah", "napak"],
    relatedDistinct: [],
    note: "Purity questions cover substances, clothing, water and the body. Context decides which.",
    leaveUntranslated: false,
  }),
  concept({
    id: "zakat", category: "finance", en: "zakat", ar: "زكاة", ur: "زکوٰۃ",
    arVariants: ["الزكاة", "زكوة", "زكاته", "تزكية المال"], urVariants: ["زکات", "زکوة", "زکوٰة"],
    enExpressions: ["obligatory alms"], transliterations: ["zakat", "zakaat", "zakah", "zakaah"],
    searchPhrases: { ar: ["زكاة المال"], ur: ["مال کی زکوٰۃ"] },
    contexts: [
      {
        id: "savings",
        match: /saving|savings|مدخر|مدخرات|ادخار|جمع شدہ|جمع کی ہوئی|بچت|bachat|jama shuda/i,
        ar: ["زكاة المال المدخر"],
        ur: ["جمع شدہ مال پر زکوٰۃ"],
        note: "Savings held for a lunar year above the nisab is the usual subject of this question. Threshold and year are conditions the books state.",
      },
      {
        id: "gold_silver",
        match: /gold|silver|jewel|jewellery|jewelry|ذهب|فضة|حلي|سونا|چاندی|زیور/i,
        ar: ["زكاة الذهب والفضة", "زكاة الحلي"],
        ur: ["سونے چاندی کی زکوٰۃ", "زیور کی زکوٰۃ"],
        note: "Schools differ on zakat on jewellery that is worn.",
      },
      {
        id: "salary_income",
        match: /salary|income|wage|تنخواہ|آمدنی|راتب|دخل/i,
        ar: ["زكاة الراتب", "زكاة المال المستفاد"],
        ur: ["تنخواہ کی زکوٰۃ", "آمدنی پر زکوٰۃ"],
        note: "Classical texts discuss acquired wealth during the year; salaries are a modern application.",
      },
    ],
    relatedDistinct: ["sadaqah", "sadaqat_al_fitr", "nisab"],
    note: "Zakat is obligatory alms on qualifying wealth. It is not voluntary charity. A term match does not establish that zakat is due.",
    leaveUntranslated: true,
  }),
  concept({
    id: "sadaqah", category: "finance", en: "voluntary charity (sadaqah)", ar: "صدقة", ur: "صدقہ",
    arVariants: ["الصدقة", "صدقات", "التطوع", "صدقة التطوع"], urVariants: ["صدقات", "خیرات", "نفلی صدقہ"],
    enExpressions: ["charity", "voluntary charity", "alms"], transliterations: ["sadaqah", "sadaqa", "sadqa", "sadqah", "khairat"],
    relatedDistinct: ["zakat", "sadaqat_al_fitr"],
    note: "Do not replace sadaqah with zakat or zakat with sadaqah.",
    leaveUntranslated: true,
  }),
  concept({
    id: "sadaqat_al_fitr", category: "finance", en: "sadaqat al-fitr (fitrana)", ar: "صدقة الفطر", ur: "صدقۂ فطر",
    arVariants: ["زكاة الفطر", "الفطرة"], urVariants: ["فطرانہ", "صدقہ فطر"],
    enExpressions: ["fitrana", "fitrah charity"], transliterations: ["fitrana", "fitra", "fitrah", "sadaqat al-fitr", "zakat al-fitr"],
    relatedDistinct: ["zakat", "sadaqah"],
    note: "The end-of-Ramadan charity is a distinct obligation from zakat on wealth.",
    leaveUntranslated: true,
  }),
  concept({
    id: "nisab", category: "finance", en: "nisab (minimum threshold)", ar: "نصاب", ur: "نصاب",
    arVariants: ["النصاب", "بلغ النصاب"], urVariants: ["نصاب کو پہنچ"],
    enExpressions: ["threshold", "minimum amount"], transliterations: ["nisab", "nisaab"],
    relatedDistinct: ["zakat"],
    note: "The threshold differs for gold, silver, livestock and crops.",
    leaveUntranslated: true,
  }),
  concept({
    id: "hawl", category: "finance", en: "lunar year of possession (hawl)", ar: "حول", ur: "سال گزرنا",
    arVariants: ["الحول", "حال عليه الحول", "حولان الحول"], urVariants: ["سال گزر", "ایک سال"],
    enExpressions: ["lunar year", "a year passes", "full year"], transliterations: ["hawl", "haul"],
    relatedDistinct: [],
    note: "A condition for zakat on money and trade goods, not for crops.",
    leaveUntranslated: true,
  }),
  concept({
    id: "sawm", category: "worship", en: "fasting (sawm)", ar: "صوم", ur: "روزہ",
    arVariants: ["الصوم", "صيام", "الصيام", "يصوم", "أفطر", "الإفطار"], urVariants: ["روزے", "روزہ ٹوٹ", "افطار"],
    enExpressions: ["fasting", "fast", "fasts", "break the fast", "ramadan"], transliterations: ["sawm", "siyam", "roza", "rozah", "roze", "ramzan", "ramadan"],
    searchPhrases: { ar: ["صوم رمضان"], ur: ["رمضان کے روزے"] },
    relatedDistinct: ["kaffarah", "qada"],
    note: "The ruling depends on which fast is meant and what happened during it.",
    leaveUntranslated: false,
  }),
  concept({
    id: "qada", category: "worship", en: "make-up (qada)", ar: "قضاء", ur: "قضا",
    arVariants: ["القضاء", "يقضي", "قضى"], urVariants: ["قضاء", "قضا روزے", "قضا نماز"],
    enExpressions: ["make up", "make-up", "missed prayer", "missed fast"], transliterations: ["qada", "qaza", "qadha"],
    relatedDistinct: ["kaffarah"],
    note: "Making up an act is distinct from expiation.",
    leaveUntranslated: true,
  }),
  concept({
    id: "kaffarah", category: "oaths", en: "expiation (kaffarah)", ar: "كفارة", ur: "کفارہ",
    arVariants: ["الكفارة", "كفارات"], urVariants: ["کفارے"],
    enExpressions: ["expiation", "atonement"], transliterations: ["kaffarah", "kaffara", "kafara", "kaffarat"],
    relatedDistinct: ["qada", "fidyah"],
    note: "Expiation differs for a broken oath, a broken fast and other causes. High-stakes.",
    leaveUntranslated: true,
  }),
  concept({
    id: "fidyah", category: "worship", en: "fidyah", ar: "فدية", ur: "فدیہ",
    arVariants: ["الفدية"], urVariants: [],
    enExpressions: ["ransom payment for missed fasts"], transliterations: ["fidyah", "fidya"],
    relatedDistinct: ["kaffarah"],
    note: "Fidyah is paid by one who cannot fast; it is not kaffarah.",
    leaveUntranslated: true,
  }),
  concept({
    id: "hajj", category: "worship", en: "hajj", ar: "حج", ur: "حج",
    arVariants: ["الحج", "يحج", "إحرام", "الإحرام", "طواف", "الطواف"], urVariants: ["احرام", "طواف"],
    enExpressions: ["pilgrimage", "ihram", "tawaf"], transliterations: ["hajj", "haj", "ihram", "tawaf"],
    relatedDistinct: ["umrah"],
    note: "Hajj and umrah have different pillars and timing.",
    leaveUntranslated: true,
  }),
  concept({
    id: "umrah", category: "worship", en: "umrah", ar: "عمرة", ur: "عمرہ",
    arVariants: ["العمرة", "يعتمر"], urVariants: ["عمرے"],
    enExpressions: ["lesser pilgrimage"], transliterations: ["umrah", "umra", "omrah"],
    relatedDistinct: ["hajj"],
    note: "Umrah is not hajj.",
    leaveUntranslated: true,
  }),
  concept({
    id: "nikah", category: "family", en: "marriage contract (nikah)", ar: "نكاح", ur: "نکاح",
    arVariants: ["النكاح", "زواج", "الزواج", "تزوج", "عقد النكاح"], urVariants: ["شادی", "نکاح کا عقد"],
    enExpressions: ["marriage", "marry", "married", "wedding"], transliterations: ["nikah", "nikaah", "shaadi", "shadi"],
    relatedDistinct: ["talaq", "mahr", "wali"],
    note: "Not a ruling on validity or conditions.",
    leaveUntranslated: true,
  }),
  concept({
    id: "mahr", category: "family", en: "dower (mahr)", ar: "مهر", ur: "مہر",
    arVariants: ["المهر", "الصداق", "صداق"], urVariants: ["حق مہر"],
    enExpressions: ["dower", "dowry"], transliterations: ["mahr", "mehr", "haq mehr"],
    relatedDistinct: ["nikah"],
    note: "Mahr is the husband's obligation to the wife. It is not the dowry a bride's family gives.",
    leaveUntranslated: true,
  }),
  concept({
    id: "wali", category: "family", en: "guardian (wali)", ar: "ولي", ur: "ولی",
    arVariants: ["الولي", "ولاية النكاح"], urVariants: ["ولی کی اجازت"],
    enExpressions: ["guardian", "guardian's permission"], transliterations: ["wali"],
    relatedDistinct: ["nikah"],
    note: "Schools differ on whether a guardian is required for a valid marriage.",
    leaveUntranslated: true,
  }),
  concept({
    id: "talaq", category: "family", en: "talaq", ar: "طلاق", ur: "طلاق",
    arVariants: ["الطلاق", "طلق", "طلقة", "ثلاث طلقات", "طالق"], urVariants: ["طلاقیں", "تین طلاق"],
    enExpressions: ["divorce", "divorced", "divorcing"], transliterations: ["talaq", "talaaq", "talak"],
    relatedDistinct: ["khula", "faskh", "iddah"],
    note: "High-stakes. Do not treat khula or faskh as the same act.",
    leaveUntranslated: true,
  }),
  concept({
    id: "khula", category: "family", en: "khula", ar: "خلع", ur: "خلع",
    arVariants: ["الخلع", "خالع"], urVariants: [],
    enExpressions: ["wife-initiated divorce"], transliterations: ["khula", "khul'"],
    relatedDistinct: ["talaq", "faskh"],
    note: "High-stakes. Khula is not talaq.",
    leaveUntranslated: true,
  }),
  concept({
    id: "faskh", category: "family", en: "judicial annulment (faskh)", ar: "فسخ", ur: "فسخ نکاح",
    arVariants: ["الفسخ", "فسخ النكاح"], urVariants: ["تنسیخ نکاح"],
    enExpressions: ["annulment"], transliterations: ["faskh"],
    relatedDistinct: ["talaq", "khula"],
    note: "High-stakes. Annulment by a judge is not a husband's pronouncement.",
    leaveUntranslated: true,
  }),
  concept({
    id: "iddah", category: "family", en: "waiting period (iddah)", ar: "عدة", ur: "عدت",
    arVariants: ["العدة", "عدتها"], urVariants: ["عدت کی مدت"],
    enExpressions: ["waiting period"], transliterations: ["iddah", "iddat", "idda"],
    relatedDistinct: ["talaq"],
    note: "The period differs by cause and by the woman's state.",
    leaveUntranslated: true,
  }),
  concept({
    id: "riba", category: "finance", en: "riba", ar: "ربا", ur: "سود",
    arVariants: ["الربا", "ربوي", "الفائدة"], urVariants: ["سودی", "بیاج", "ربا"],
    enExpressions: ["interest", "usury", "interest-bearing"], transliterations: ["riba", "ribaa", "sood", "sud"],
    relatedDistinct: ["bay", "qard"],
    note: "Do not treat every kind of interest, profit or fee as the same category.",
    leaveUntranslated: true,
  }),
  concept({
    id: "qard", category: "finance", en: "loan (qard)", ar: "قرض", ur: "قرض",
    arVariants: ["القرض", "أقرض", "استقرض"], urVariants: ["قرضہ", "ادھار"],
    enExpressions: ["loan", "lend", "borrow", "borrowed"], transliterations: ["qard", "qarz", "karz"],
    relatedDistinct: ["dayn", "riba"],
    note: "A loan creates a debt; the two words are not interchangeable in the books.",
    leaveUntranslated: true,
  }),
  concept({
    id: "dayn", category: "finance", en: "debt (dayn)", ar: "دين", ur: "قرض",
    arVariants: ["الدين", "ديون", "مدين", "الديون"], urVariants: ["قرض دار", "مقروض", "قرضے"],
    enExpressions: ["debt", "debts", "owe", "in debt", "debtor"], transliterations: ["dayn", "dain"],
    relatedDistinct: ["qard", "zakat"],
    note: "Whether debt reduces zakatable wealth is a classic point of difference. Possession and ownership matter.",
    leaveUntranslated: true,
  }),
  concept({
    id: "bay", category: "finance", en: "sale and trade (bay')", ar: "بيع", ur: "خرید و فروخت",
    arVariants: ["البيع", "البيوع", "التجارة", "تجارة", "شراء", "الشراء"], urVariants: ["تجارت", "بیع", "کاروبار", "خریدنا", "بیچنا"],
    enExpressions: ["sale", "selling", "sell", "buying", "trade", "business", "transaction"], transliterations: ["bay", "bai", "tijarah", "tijarat"],
    relatedDistinct: ["riba", "ijarah"],
    note: "Trade questions depend on the contract type. A keyword match does not identify the contract.",
    leaveUntranslated: false,
  }),
  concept({
    id: "shirkah", category: "finance", en: "partnership (shirkah)", ar: "شركة", ur: "شراکت",
    arVariants: ["الشركة", "شركات", "شركة العقد", "مضاربة", "المضاربة"], urVariants: ["شراکت داری", "مضاربت", "شرکت"],
    enExpressions: ["partnership", "partner", "partners", "joint venture"], transliterations: ["shirkah", "shirka", "musharakah", "mudarabah", "mudaraba"],
    relatedDistinct: ["bay", "zakat"],
    note: "Partnership and investment contracts are not zakat on savings. A shared word for wealth does not make the passage evidence for zakat.",
    leaveUntranslated: true,
  }),
  concept({
    id: "ijarah", category: "finance", en: "hire and lease (ijarah)", ar: "إجارة", ur: "اجارہ",
    arVariants: ["الإجارة", "أجرة", "الأجرة"], urVariants: ["کرایہ", "اجرت"],
    enExpressions: ["rent", "lease", "hire", "wages"], transliterations: ["ijarah", "ijara"],
    relatedDistinct: ["bay"],
    note: "Hire is a different contract from sale.",
    leaveUntranslated: true,
  }),
  concept({
    id: "mirath", category: "family", en: "inheritance (mirath)", ar: "ميراث", ur: "وراثت",
    arVariants: ["الميراث", "الفرائض", "فرائض", "الإرث", "ورثة", "الورثة", "تركة", "التركة"], urVariants: ["میراث", "وراثت", "ترکہ", "ورثاء", "وارث"],
    enExpressions: ["inheritance", "inherit", "heir", "heirs", "estate"], transliterations: ["mirath", "meerath", "fara'id", "faraid", "wirasat"],
    relatedDistinct: ["wasiyyah"],
    note: "High-stakes. Shares depend on the full set of heirs; no single passage settles a case.",
    leaveUntranslated: true,
  }),
  concept({
    id: "wasiyyah", category: "family", en: "bequest (wasiyyah)", ar: "وصية", ur: "وصیت",
    arVariants: ["الوصية", "أوصى"], urVariants: ["وصیت نامہ"],
    enExpressions: ["bequest", "last will", "written will"], transliterations: ["wasiyyah", "wasiyat", "wasiyya"],
    relatedDistinct: ["mirath"],
    note: "A bequest is limited and distinct from the fixed inheritance shares.",
    leaveUntranslated: true,
  }),
  concept({
    id: "yamin", category: "oaths", en: "oath (yamin)", ar: "يمين", ur: "قسم",
    arVariants: ["اليمين", "أيمان", "الأيمان", "حلف", "الحلف"], urVariants: ["قسمیں", "حلف", "قسم کھا"],
    enExpressions: ["oath", "swear", "swore", "sworn"], transliterations: ["yamin", "yameen", "qasam", "halaf"],
    relatedDistinct: ["nadhr", "kaffarah"],
    note: "High-stakes. An oath is not a vow; breaking each has its own consequence.",
    leaveUntranslated: true,
  }),
  concept({
    id: "nadhr", category: "oaths", en: "vow (nadhr)", ar: "نذر", ur: "نذر",
    arVariants: ["النذر", "نذور"], urVariants: ["منت", "نذر ماننا"],
    enExpressions: ["vow", "vowed"], transliterations: ["nadhr", "nazr", "nadr", "mannat"],
    relatedDistinct: ["yamin"],
    note: "High-stakes. A vow binds differently from an oath.",
    leaveUntranslated: true,
  }),
  concept({
    id: "halal", category: "legal_category", en: "lawful (halal)", ar: "حلال", ur: "حلال",
    arVariants: ["الحلال", "يحل", "جائز", "الجائز", "يجوز"], urVariants: ["جائز"],
    enExpressions: ["lawful", "permitted", "permissible", "allowed"], transliterations: ["halal", "halaal", "jaiz", "jaaiz"],
    relatedDistinct: ["haram", "makruh", "mubah"],
    note: "Permitted is not the same as recommended.",
    leaveUntranslated: false,
  }),
  concept({
    id: "haram", category: "legal_category", en: "prohibited (haram)", ar: "حرام", ur: "حرام",
    arVariants: ["الحرام", "يحرم", "محرم", "لا يجوز"], urVariants: ["ناجائز", "حرام ہے"],
    enExpressions: ["prohibited", "forbidden", "unlawful", "not allowed"], transliterations: ["haram", "haraam", "najaiz"],
    relatedDistinct: ["halal", "makruh", "batil"],
    note: "Prohibited is not the same as invalid.",
    leaveUntranslated: false,
  }),
  concept({
    id: "fard", category: "legal_category", en: "fard", ar: "فرض", ur: "فرض",
    arVariants: ["الفرض", "فرائض", "مفروض", "فريضة"], urVariants: ["فرض ہے", "فرائض"],
    enExpressions: ["obligatory at the level of fard"], transliterations: ["fard", "farz", "fardh"],
    relatedDistinct: ["wajib", "sunnah"],
    note: "Hanafi usage distinguishes fard from wajib. Do not merge them when reporting a Hanafi text.",
    leaveUntranslated: true,
  }),
  concept({
    id: "wajib", category: "legal_category", en: "wajib", ar: "واجب", ur: "واجب",
    arVariants: ["الواجب", "يجب", "تجب", "وجوب", "الوجوب"], urVariants: ["واجب ہے", "وجوب"],
    enExpressions: ["obligatory", "required", "compulsory"], transliterations: ["wajib", "waajib"],
    relatedDistinct: ["fard", "sunnah"],
    note: "Do not treat wajib and fard as synonyms when reporting a Hanafi text.",
    leaveUntranslated: true,
  }),
  concept({
    id: "sunnah", category: "legal_category", en: "sunnah", ar: "سنة", ur: "سنت",
    arVariants: ["السنة", "مسنون", "سنن", "مؤكدة"], urVariants: ["سنت مؤکدہ", "مسنون", "سنتیں"],
    enExpressions: ["prophetic practice", "sunnah prayer"], transliterations: ["sunnah", "sunnat", "sunna"],
    relatedDistinct: ["fard", "wajib", "mustahabb"],
    note: "Emphasised and non-emphasised sunnah are not the same in Hanafi works.",
    leaveUntranslated: true,
  }),
  concept({
    id: "mustahabb", category: "legal_category", en: "recommended (mustahabb)", ar: "مستحب", ur: "مستحب",
    arVariants: ["المستحب", "يستحب", "مندوب", "المندوب", "نفل", "النفل", "تطوع"], urVariants: ["مستحب ہے", "نفل", "نفلی"],
    enExpressions: ["recommended", "voluntary act", "nafl", "optional prayer"], transliterations: ["mustahabb", "mustahab", "mandub", "nafl", "nafil"],
    relatedDistinct: ["sunnah", "wajib"],
    note: "Recommended is below sunnah mu'akkadah in weight. Not an obligation.",
    leaveUntranslated: true,
  }),
  concept({
    id: "makruh", category: "legal_category", en: "makruh", ar: "مكروه", ur: "مکروہ",
    arVariants: ["المكروه", "يكره", "كراهة", "تحريما", "تنزيها"], urVariants: ["مکروہ تحریمی", "مکروہ تنزیہی", "کراہت"],
    enExpressions: ["disliked", "discouraged"], transliterations: ["makruh", "makrooh", "makrooh tahrimi"],
    relatedDistinct: ["haram", "halal"],
    note: "Do not render makruh as merely discouraged when the text means prohibitively disliked.",
    leaveUntranslated: true,
  }),
  concept({
    id: "mubah", category: "legal_category", en: "permissible (mubah)", ar: "مباح", ur: "مباح",
    arVariants: ["المباح", "إباحة"], urVariants: [],
    enExpressions: ["neutral act"], transliterations: ["mubah"],
    relatedDistinct: ["halal", "mustahabb"],
    note: "Permissible is not the same as recommended.",
    leaveUntranslated: false,
  }),
  concept({
    id: "sahih", category: "legal_category", en: "valid (sahih)", ar: "صحيح", ur: "صحیح",
    arVariants: ["الصحيح", "يصح", "تصح", "صحة", "الصحة"], urVariants: ["درست", "صحیح ہے", "ہو جاتی ہے", "ہو جاتا ہے"],
    enExpressions: ["valid", "validity", "counts", "accepted"], transliterations: ["sahih", "saheeh"],
    relatedDistinct: ["batil", "fasid", "wajib"],
    note: "A valid act is not the same as an obligatory or recommended one.",
    leaveUntranslated: false,
  }),
  concept({
    id: "batil", category: "legal_category", en: "invalid (batil)", ar: "باطل", ur: "باطل",
    arVariants: ["الباطل", "يبطل", "تبطل", "بطلان", "فسدت", "تفسد"], urVariants: ["باطل ہے", "فاسد", "ٹوٹ جاتی ہے", "ٹوٹ جاتا ہے"],
    enExpressions: ["invalid", "void", "nullified", "breaks", "broken", "invalidates"], transliterations: ["batil", "baatil", "fasid"],
    relatedDistinct: ["sahih", "haram"],
    note: "Invalid is not the same as prohibited. Hanafi texts also separate batil from fasid in contracts.",
    leaveUntranslated: false,
  }),
  concept({
    id: "intent_obligation", category: "question_intent", en: "is it obligatory", ar: "هل يجب", ur: "کیا واجب ہے",
    arVariants: ["هل يجب", "هل تجب", "أيجب"], urVariants: ["کیا واجب ہے", "کیا ضروری ہے", "کیا فرض ہے", "دینا ہوگا", "دینی ہوگی", "کیا لازم ہے"],
    enExpressions: ["do i have to", "do we have to", "must i", "must we", "am i required", "is it obligatory", "is it compulsory", "is it mandatory", "do i need to", "is it required", "have to pay", "need to pay"],
    transliterations: ["kya wajib hai", "kya zaroori hai", "kya farz hai"],
    searchPhrases: { ar: ["يجب", "تجب", "واجب"], ur: ["واجب", "لازم"] },
    relatedDistinct: ["intent_validity", "intent_permissibility"],
    note: "The question asks about obligation. Search words are يجب / واجب. Whether the answer is fard or wajib is left to the passage.",
    leaveUntranslated: false,
  }),
  concept({
    id: "intent_validity", category: "question_intent", en: "is it valid", ar: "هل يصح", ur: "کیا درست ہے",
    arVariants: ["هل يصح", "هل تصح", "هل يبطل", "هل تبطل"], urVariants: ["کیا درست ہے", "کیا صحیح ہے", "کیا ہو جاتی ہے", "کیا ہو جاتا ہے", "کیا ٹوٹ جاتی ہے", "کیا ٹوٹ جاتا ہے"],
    enExpressions: ["valid", "invalid", "validity", "still valid", "does it count", "is it accepted", "does it break", "is it broken", "invalidate", "invalidates", "nullified", "nullify"],
    transliterations: ["kya sahih hai", "kya durust hai", "toot jati hai", "toot jata hai"],
    searchPhrases: { ar: ["يصح", "تصح", "يبطل", "تبطل", "صحة"], ur: ["صحیح", "درست", "ٹوٹ", "فاسد"] },
    relatedDistinct: ["intent_obligation"],
    note: "A validity question is not an obligation question. Both intents can appear; keep them separate.",
    leaveUntranslated: false,
  }),
  concept({
    id: "intent_permissibility", category: "question_intent", en: "is it permissible", ar: "هل يجوز", ur: "کیا جائز ہے",
    arVariants: ["هل يجوز", "أيجوز", "هل يحل", "هل يحرم"], urVariants: ["کیا جائز ہے", "کیا حلال ہے", "کیا حرام ہے", "کیا ناجائز ہے", "کیا اجازت ہے"],
    enExpressions: ["is it allowed", "is it permissible", "is it permitted", "can i", "can we", "may i", "is it haram", "is it halal", "am i allowed", "is it ok to", "is it okay to"],
    transliterations: ["kya jaiz hai", "kya halal hai", "kya haram hai"],
    searchPhrases: { ar: ["يجوز", "لا يجوز", "يحل", "يحرم"], ur: ["جائز", "ناجائز", "حلال", "حرام"] },
    relatedDistinct: ["intent_obligation", "intent_validity"],
    note: "Permissibility is a different question from obligation or validity.",
    leaveUntranslated: false,
  }),
];

function latinForms(entry: Concept): string[] {
  return [...entry.enExpressions, ...entry.transliterations].map((form) => form.toLowerCase());
}

function arabicScriptForms(entry: Concept): string[] {
  return [entry.ar, entry.ur, ...entry.arVariants, ...entry.urVariants].filter((form) => /[\u0600-\u06FF]/.test(form));
}

function latinMatches(tokens: string[], joined: string, form: string): boolean {
  if (form.includes(" ") || form.includes("'")) return joined.includes(` ${form.replace(/'/g, "")} `) || joined.includes(` ${form} `);
  return tokens.some((token) => token === form || token === `${form}s` || token === `${form}es`);
}

/** Concepts whose written forms appear in the text. Latin forms match whole words; Arabic-script forms match after search normalization. */
export function findConcepts(text: string): Concept[] {
  const tokens = text.toLowerCase().normalize("NFC").split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  const joined = ` ${tokens.join(" ")} `;
  const normalized = ` ${normalizeForSearch(text)} `;
  const normalizedTokens = new Set(tokenize(text));
  return CONCEPTS.filter((entry) => {
    if (latinForms(entry).some((form) => latinMatches(tokens, joined, form))) return true;
    return arabicScriptForms(entry).some((form) => {
      const folded = normalizeForSearch(form);
      if (!folded) return false;
      if (folded.includes(" ")) return normalized.includes(folded);
      if (normalizedTokens.has(folded)) return true;
      // Arabic and Urdu attach prefixes (ال، و، ب، لل) and suffixes to a stem; accept a token that contains the stem when the stem is long enough.
      return folded.length >= 4 && Array.from(normalizedTokens).some((token) => token.includes(folded));
    });
  });
}

export function conceptById(id: string): Concept | null {
  return CONCEPTS.find((entry) => entry.id === id) ?? null;
}

/** Search terms per language for a set of matched concepts, with context phrases first. */
export function searchTermsFor(entries: Concept[], question: string): { ar: string[]; ur: string[]; en: string[]; contexts: ConceptContext[] } {
  const ar: string[] = [];
  const ur: string[] = [];
  const en: string[] = [];
  const contexts: ConceptContext[] = [];
  for (const entry of entries) {
    for (const context of entry.contexts ?? []) {
      if (!context.match.test(question)) continue;
      contexts.push(context);
      ar.push(...context.ar);
      ur.push(...context.ur);
    }
  }
  for (const entry of entries) {
    if (entry.category === "question_intent") continue;
    ar.push(entry.ar, ...(entry.searchPhrases?.ar ?? []));
    ur.push(entry.ur, ...(entry.searchPhrases?.ur ?? []));
    en.push(entry.en);
  }
  for (const entry of entries) {
    if (entry.category !== "question_intent") continue;
    ar.push(...(entry.searchPhrases?.ar ?? []));
    ur.push(...(entry.searchPhrases?.ur ?? []));
  }
  return { ar: unique(ar), ur: unique(ur), en: unique(en), contexts };
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  return items.map((item) => item.trim()).filter((item) => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function toEntry(entry: Concept): GlossaryEntry {
  return {
    ...entry,
    arabic: entry.ar,
    transliteration: entry.transliterations[0] ?? entry.id,
    forms: [entry.ar, entry.ur, ...entry.arVariants, ...entry.urVariants, ...entry.enExpressions, ...entry.transliterations],
    preferred: { en: entry.en, ar: entry.ar, ur: entry.ur },
    legalNote: entry.note,
  };
}

/** Back-compat list shape. */
export const GLOSSARY: GlossaryEntry[] = CONCEPTS.map(toEntry);

export function findGlossaryHits(text: string): GlossaryEntry[] {
  return findConcepts(text).map(toEntry);
}
