import { getLocale, type LocaleDefinition } from "@/data/languages";

export const NO_EVIDENCE_EN =
  "We could not locate a sufficiently reliable source for this question in the currently indexed material for your selected madhhab. We do not want to guess or present an unsupported religious ruling. Please consult a qualified mufti.";

const noEvidence: Record<string, string> = {
  en: NO_EVIDENCE_EN,
  "zh-Hans": "在您所选教法学派目前已索引的资料中，我们未能为这个问题找到足够可靠的来源。我们不愿猜测，也不愿提出没有依据的宗教判断。请咨询一位合格的穆夫提。",
  "zh-Hant": "在您所選教法學派目前已索引的資料中，我們未能為這個問題找到足夠可靠的來源。我們不願猜測，也不願提出沒有依據的宗教判斷。請諮詢一位合格的穆夫提。",
  hi: "आपके चुने हुए मज़हब की अभी सूचीबद्ध सामग्री में इस प्रश्न के लिए पर्याप्त विश्वसनीय स्रोत नहीं मिला। हम अनुमान नहीं लगाना चाहते और बिना प्रमाण के धार्मिक हुक्म नहीं देना चाहते। कृपया किसी योग्य मुफ्ती से सलाह लें।",
  es: "No encontramos una fuente suficientemente fiable para esta pregunta en el material indexado del madhhab que usted eligió. No queremos adivinar ni presentar un dictamen religioso sin respaldo. Consulte a un muftí cualificado.",
  ar: "لم نعثر على مصدر موثوق بدرجة كافية لهذا السؤال في المادة المفهرسة حاليًا للمذهب الذي اخترته. لا نريد أن نخمّن أو أن نقدّم حكمًا شرعيًا بلا مستند. يُرجى مراجعة مفتٍ مؤهَّل.",
  fr: "Nous n'avons pas trouvé de source suffisamment fiable pour cette question dans les documents indexés du madhhab que vous avez choisi. Nous ne voulons ni deviner ni présenter une règle religieuse sans appui. Veuillez consulter un mufti qualifié.",
  bn: "আপনার নির্বাচিত মাজহাবের বর্তমানে সূচিভুক্ত উপাদানে এই প্রশ্নের জন্য যথেষ্ট নির্ভরযোগ্য উৎস পাওয়া যায়নি। আমরা অনুমান করতে চাই না এবং প্রমাণ ছাড়া ধর্মীয় ফতোয়া দিতে চাই না। অনুগ্রহ করে একজন যোগ্য মুফতির সঙ্গে পরামর্শ করুন।",
  pt: "Não encontrámos uma fonte suficientemente fiável para esta pergunta no material indexado do madhhab que escolheu. Não queremos adivinhar nem apresentar uma orientação religiosa sem fundamento. Consulte um mufti qualificado.",
  id: "Kami tidak menemukan sumber yang cukup tepercaya untuk pertanyaan ini dalam bahan yang sudah diindeks bagi mazhab yang Anda pilih. Kami tidak ingin menebak atau menyampaikan hukum agama tanpa dalil. Silakan bertanya kepada mufti yang berkualifikasi.",
  ur: "آپ کے منتخب مذہب کے موجودہ انڈیکس شدہ مواد میں اس سوال کے لیے کافی قابلِ اعتماد ماخذ نہیں ملا۔ ہم اندازہ لگانا یا بغیر سند کے شرعی حکم پیش نہیں کرنا چاہتے۔ براہِ کرم کسی اہل مفتی سے رجوع کریں۔",
  ru: "В проиндексированных материалах выбранного вами мазхаба не нашлось достаточно надёжного источника по этому вопросу. Мы не хотим гадать или предлагать религиозное решение без основания. Пожалуйста, обратитесь к квалифицированному муфтию.",
  de: "In dem derzeit indexierten Material der von Ihnen gewählten Rechtsschule haben wir keine ausreichend verlässliche Quelle zu dieser Frage gefunden. Wir möchten nicht raten und kein religiöses Urteil ohne Beleg abgeben. Bitte wenden Sie sich an einen qualifizierten Mufti.",
  ja: "選択された法学派について現在索引されている資料の中に、この質問に対する十分に信頼できる典拠が見つかりませんでした。推測したり、根拠のない宗教的判断を示したりはしません。資格のあるムフティーにご相談ください。",
  pcm: "We no see any source wey strong enough for this question inside the material wey we don index for the madhhab wey you choose. We no go guess, and we no go give a religious ruling wey no get support. Abeg ask a qualified mufti.",
  "ar-EG": "ما لقيناش مصدر موثوق كفاية للسؤال ده في المادة المفهرسة للمذهب اللي اخترته. مش هنخمّن ومش هنقدّم حكم ديني من غير دليل. راجع مفتي مؤهَّل.",
  mr: "तुम्ही निवडलेल्या मजहबच्या सध्या अनुक्रमित साहित्यात या प्रश्नासाठी पुरेसा विश्वासार्ह स्रोत सापडला नाही. आम्ही अंदाज लावू इच्छित नाही आणि पुराव्याशिवाय धार्मिक हुकूम देऊ इच्छित नाही. कृपया एखाद्या योग्य मुफ्तीचा सल्ला घ्या.",
  vi: "Trong tài liệu đã lập chỉ mục của giáo phái bạn đã chọn, chúng tôi không tìm thấy nguồn đủ đáng tin cho câu hỏi này. Chúng tôi không muốn đoán hoặc đưa ra phán quyết tôn giáo khi không có căn cứ. Hãy hỏi một mufti có năng lực.",
  te: "మీరు ఎంచుకున్న మజ్హబ్‌కు ప్రస్తుతం సూచిక చేసిన పదార్థంలో ఈ ప్రశ్నకు తగినంత నమ్మకమైన మూలం దొరకలేదు. మేము ఊహించాలని అనుకోము మరియు ఆధారం లేకుండా మతపరమైన తీర్పు ఇవ్వాలని అనుకోము. దయచేసి అర్హత కలిగిన ముఫ్తీని సంప్రదించండి.",
  sw: "Hatukuweza kupata chanzo cha kuaminika vya kutosha kwa swali hili katika nyenzo zilizoorodheshwa za madhhab uliyochagua. Hatutaki kukisia wala kutoa hukumu ya dini bila ushahidi. Tafadhali muulize mufti aliyehitimu.",
  ha: "Ba mu sami tushe mai isasshen dogaro ba game da wannan tambayar a cikin abubuwan da aka fihirinta na madhhabin da kuka zaɓa. Ba ma son yin zato ko bayar da hukuncin addini ba tare da hujja ba. Da fatan za a tuntuɓi mufti mai cancanta.",
};

const generationUnavailable: Record<string, string> = {
  en: "A language model is not configured, so no ruling is issued. Text shown as a source excerpt is a quotation from the index, not a fatwa from this service.",
  "zh-Hans": "未配置语言模型，因此不作出裁决。作为来源摘录显示的文字是索引中的引文，不是本服务作出的法特瓦。",
  "zh-Hant": "未配置語言模型，因此不作出裁決。作為來源摘錄顯示的文字是索引中的引文，不是本服務作出的法特瓦。",
  hi: "भाषा मॉडल कॉन्फ़िगर नहीं है, इसलिए कोई हुक्म नहीं दिया जा रहा। स्रोत अंश के रूप में दिखने वाला पाठ सूचकांक का उद्धरण है, इस सेवा की फतोवा नहीं।",
  es: "No hay un modelo de lengua configurado, así que no se emite un dictamen. El texto mostrado como extracto es una cita del índice, no una fatwa de este servicio.",
  ar: "لم يُضبط نموذج لغوي، ولذلك لا يُصدر حكم. النص المعروض كمقتطف هو نقل من الفهرس، وليس فتوى من هذه الخدمة.",
  fr: "Aucun modèle de langue n'est configuré, donc aucune règle n'est rendue. Le texte affiché comme extrait est une citation de l'index, pas une fatwa de ce service.",
  bn: "ভাষা মডেল কনফিগার করা নেই, তাই কোনো ফতোয়া দেওয়া হচ্ছে না। উদ্ধৃতি হিসেবে দেখানো লেখা সূচির বরাতে, এই সেবার ফতোয়া নয়।",
  pt: "Nenhum modelo de língua está configurado, por isso não é emitida uma orientação. O texto mostrado como excerto é uma citação do índice, não uma fatwa deste serviço.",
  id: "Model bahasa tidak dikonfigurasi, jadi tidak ada hukum yang dikeluarkan. Teks yang ditampilkan sebagai kutipan adalah kutipan indeks, bukan fatwa dari layanan ini.",
  ur: "زبان کا ماڈل ترتیب نہیں دیا گیا، اس لیے کوئی حکم نہیں دیا جا رہا۔ اقتباس کے طور پر دکھایا گیا متن انڈیکس سے نقل ہے، اس خدمت کا فتوی نہیں۔",
  ru: "Языковая модель не настроена, поэтому решение не выносится. Текст в виде выдержки — это цитата из указателя, а не фетва этой службы.",
  de: "Es ist kein Sprachmodell konfiguriert, deshalb wird kein Urteil gegeben. Text, der als Auszug erscheint, ist ein Zitat aus dem Index und keine Fatwa dieses Dienstes.",
  ja: "言語モデルが設定されていないため、判断は示しません。出典抜粋として示す文章は索引からの引用であり、このサービスのファトワーではありません。",
  pcm: "Language model never configure, so we no go give ruling. Text wey show as excerpt na quotation from the index, no be fatwa from this service.",
  "ar-EG": "مفيش نموذج لغوي متظبط، فمفيش حكم هيطلع. النص اللي ظاهر كمقتطف منقول من الفهرس، ومش فتوى من الخدمة دي.",
  mr: "भाषा मॉडेल सेट केलेले नाही, त्यामुळे हुकूम दिला जात नाही. उतारा म्हणून दिसणारा मजकूर अनुक्रमातील अवतरण आहे, या सेवेचा फतवा नाही.",
  vi: "Chưa cấu hình mô hình ngôn ngữ, nên không đưa ra phán quyết. Đoạn trích là lời trích từ chỉ mục, không phải fatwa của dịch vụ này.",
  te: "భాషా నమూనా అమర్చబడలేదు, కాబట్టి తీర్పు ఇవ్వడం లేదు. ఉటంకంగా కనిపించే పాఠ్యం సూచికలోని ఉల్లేఖన, ఈ సేవ ఫత్వా కాదు.",
  sw: "Mfumo wa lugha haujawekwa, kwa hiyo hukumu haitolewi. Maandishi yanayoonekana kama dondoo ni nukuu kutoka kwenye faharasa, si fatwa ya huduma hii.",
  ha: "Ba a saita samfurin harshe ba, saboda haka ba a bayar da hukunci. Rubutun da aka nuna a matsayin zango karatu ne daga fihirisa, ba fatwa ta wannan sabis ba.",
};

const notAMufti: Record<string, string> = {
  en: "This is an AI-assisted research service, not a mufti, and not a substitute for qualified scholarly judgment.",
  "zh-Hans": "这是一项人工智能辅助的检索服务，不是穆夫提，也不能代替合格学者的判断。",
  "zh-Hant": "這是一項人工智慧輔助的檢索服務，不是穆夫提，也不能代替合格學者的判斷。",
  hi: "यह एआई-सहायता प्राप्त शोध सेवा है, मुफ्ती नहीं, और योग्य विद्वानों के निर्णय का विकल्प नहीं।",
  es: "Este es un servicio de investigación asistido por IA, no un muftí, y no sustituye el juicio de un erudito cualificado.",
  ar: "هذه خدمة بحث بمساعدة الذكاء الاصطناعي، وليست مفتيًا، ولا تغني عن نظر عالم مؤهَّل.",
  fr: "Ceci est un service de recherche assisté par IA, pas un mufti, et il ne remplace pas le jugement d'un savant qualifié.",
  bn: "এটি একটি এআই-সহায়ক গবেষণা সেবা, মুফতি নয়, এবং যোগ্য আলেমের বিচারের বিকল্প নয়।",
  pt: "Este é um serviço de pesquisa assistido por IA, não um mufti, e não substitui o juízo de um erudito qualificado.",
  id: "Ini layanan penelitian berbantuan AI, bukan mufti, dan bukan pengganti penilaian ulama yang berkualifikasi.",
  ur: "یہ اے آئی کی مدد سے تحقیقی خدمت ہے، مفتی نہیں، اور اہل عالم کے فیصلے کا بدل نہیں۔",
  ru: "Это исследовательская служба с помощью ИИ, а не муфтий, и она не заменяет суждение квалифицированного учёного.",
  de: "Dies ist ein KI-gestützter Forschungsdienst, kein Mufti, und kein Ersatz für das Urteil einer qualifizierten Gelehrtenperson.",
  ja: "これはAIを補助に使った調査サービスであり、ムフティーではなく、資格のある学者の判断の代わりにもなりません。",
  pcm: "This na AI-assisted research service, no be mufti, and e no fit replace qualified scholar judgment.",
  "ar-EG": "دي خدمة بحث بمساعدة الذكاء الاصطناعي، مش مفتي، ومش بديل لحكم عالم مؤهَّل.",
  mr: "ही एआय-सहाय्यित संशोधन सेवा आहे, मुफ्ती नाही, आणि योग्य विद्वानाच्या निर्णयाचा पर्याय नाही.",
  vi: "Đây là dịch vụ tra cứu có AI hỗ trợ, không phải mufti, và không thay thế phán đoán của học giả có năng lực.",
  te: "ఇది AI సహాయంతో పరిశోధన సేవ, ముఫ్తీ కాదు, మరియు అర్హత కలిగిన పండితుని తీర్పుకు ప్రత్యామ్నాయం కాదు.",
  sw: "Hii ni huduma ya utafiti inayosaidiwa na AI, si mufti, wala si mbadala wa hukumu ya mwanachuoni aliyehitimu.",
  ha: "Wannan sabis ne na bincike tare da taimakon AI, ba mufti ba, kuma ba maye gurbin hukuncin malami mai cancanta ba.",
};

export type Copy = {
  locale: LocaleDefinition;
  noEvidence: string;
  generationUnavailable: string;
  notAMufti: string;
  nativeReview: "author" | "pending";
  canonicalEnglish: string | null;
};

export function getCopy(localeId: string): Copy {
  const locale = getLocale(localeId);
  if (!locale) throw new Error("INVALID_LOCALE");
  const review = locale.localeId === "en" ? "author" : "pending";
  return {
    locale,
    noEvidence: noEvidence[locale.localeId] ?? NO_EVIDENCE_EN,
    generationUnavailable: generationUnavailable[locale.localeId] ?? generationUnavailable.en,
    notAMufti: notAMufti[locale.localeId] ?? notAMufti.en,
    nativeReview: review,
    canonicalEnglish: review === "pending" ? NO_EVIDENCE_EN : null,
  };
}

export function messageLocales(): string[] {
  return Object.keys(noEvidence);
}
