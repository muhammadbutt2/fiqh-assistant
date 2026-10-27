import { describe, expect, it } from "vitest";
import { findConcepts } from "@/data/glossary";
import { detectLanguage, hasNegation } from "@/server/detect";
import { processQuestion, processQuestionWithProvider, processedQuerySchema } from "@/server/query";

const EN = "Do I have to pay zakat on my savings?";
const UR = "کیا میرے جمع شدہ پیسوں پر زکوٰۃ واجب ہے؟";
const AR = "هل تجب الزكاة على المال المدخر؟";

describe("three-language query processing", () => {
  it("returns a structured result that matches the schema and never edits the original", () => {
    for (const question of [EN, UR, AR]) {
      const result = processQuestion(question);
      expect(result.original).toBe(question);
      expect(result.variants[0]?.text).toBe(question);
      const { variants: _variants, detection: _detection, ...plain } = result;
      expect(processedQuerySchema.safeParse(plain).success).toBe(true);
    }
  });

  it("Example A: English question yields Arabic and Urdu search queries about zakat on savings", () => {
    const result = processQuestion(EN);
    expect(result.detectedLanguage).toBe("en");
    expect(result.arabicQuery.method).toBe("terminology");
    expect(result.arabicQuery.text).toContain("زكاة المال المدخر");
    expect(result.arabicQuery.text).toMatch(/تجب|يجب|واجب/);
    expect(result.urduQuery.method).toBe("terminology");
    expect(result.urduQuery.text).toContain("جمع شدہ مال پر زکوٰۃ");
    expect(result.urduQuery.text).toContain("واجب");
    expect(result.concepts.map((item) => item.id)).toEqual(expect.arrayContaining(["zakat", "intent_obligation"]));
    expect(result.concepts.map((item) => item.id)).not.toContain("sadaqah");
    expect(result.englishIntermediate).toBe(EN);
    expect(result.warnings.join(" ")).toMatch(/terminology strings, not a translation/);
  });

  it("Example B: Urdu question keeps Urdu as the source query and derives an Arabic query", () => {
    const result = processQuestion(UR);
    expect(result.detectedLanguage).toBe("ur");
    expect(result.detectionConfidence).toBe("high");
    expect(result.urduQuery.method).toBe("source_language");
    expect(result.urduQuery.text).toContain("زكو");
    expect(result.arabicQuery.method).toBe("terminology");
    expect(result.arabicQuery.text).toContain("زكاة");
    expect(result.arabicQuery.text).toContain("زكاة المال المدخر");
    expect(result.englishIntermediate).toMatch(/zakat/);
  });

  it("Example C: Arabic question keeps Arabic as the source query and derives an Urdu query", () => {
    const result = processQuestion(AR);
    expect(result.detectedLanguage).toBe("ar");
    expect(result.arabicQuery.method).toBe("source_language");
    expect(result.arabicQuery.text).toContain("زكاة");
    expect(result.urduQuery.method).toBe("terminology");
    expect(result.urduQuery.text).toContain("زکوٰۃ");
    expect(result.urduQuery.text).toContain("جمع شدہ مال پر زکوٰۃ");
  });

  it("does not confuse Arabic with Urdu, and handles Roman Urdu", () => {
    expect(detectLanguage("هل يجوز الجمع بين الصلاتين في السفر").language).toBe("ar");
    expect(detectLanguage("کیا سفر میں دو نمازیں جمع کرنا جائز ہے").language).toBe("ur");
    expect(detectLanguage("Kya safar mein do namazen jama karna jaiz hai").language).toBe("ur-Latn");
    expect(detectLanguage("Is it permissible to combine prayers while travelling?").language).toBe("en");
    expect(detectLanguage("Привет").language).toBe("und");
  });

  it("keeps negations, conditions, numbers and quantities", () => {
    const result = processQuestion("If I did not fast for 3 days in Ramadan without an excuse, do I owe kaffarah or only qada?");
    expect(result.entities.negations).toEqual(expect.arrayContaining(["not", "without"]));
    expect(result.entities.conditions).toEqual(expect.arrayContaining(["if", "only"]));
    expect(result.entities.numbers).toContain("3");
    expect(result.entities.timeReferences).toContain("ramadan");
    expect(result.concepts.map((item) => item.id)).toEqual(expect.arrayContaining(["sawm", "kaffarah", "qada"]));
    expect(result.highStakes).toBe(true);

    const urdu = processQuestion("اگر میں نے بغیر عذر کے رمضان کے ۳ روزے نہیں رکھے تو کیا کفارہ لازم ہے؟");
    expect(urdu.entities.negations).toEqual(expect.arrayContaining(["نہیں", "بغیر"]));
    expect(urdu.entities.conditions).toContain("اگر");
    expect(urdu.entities.numbers).toContain("3");

    const arabic = processQuestion("إذا لم أصم ثلاثة أيام من رمضان بلا عذر فهل تلزمني الكفارة؟");
    expect(arabic.entities.negations).toEqual(expect.arrayContaining(["لم", "بلا"]));
    expect(arabic.entities.conditions).toContain("إذا");
    expect(arabic.entities.numbers).toContain("ثلاثة");
    expect(hasNegation("The prayer is not valid")).toBe(true);
    expect(hasNegation("ما حكم الصلاة")).toBe(false);
  });

  it("does not interchange fard, wajib, sunnah, makruh or validity with obligation", () => {
    const fard = processQuestion("Is witr fard or wajib in the Hanafi school?");
    expect(fard.concepts.map((item) => item.id)).toEqual(expect.arrayContaining(["fard", "wajib"]));
    expect(fard.ambiguities.join(" ")).toMatch(/fard and wajib/);
    const validity = processQuestion("Is my prayer valid if I forgot the tashahhud?");
    const ids = validity.concepts.map((item) => item.id);
    expect(ids).toContain("intent_validity");
    expect(ids).not.toContain("intent_obligation");
    expect(validity.arabicQuery.text).toMatch(/يصح|تصح|يبطل|تبطل/);
    expect(validity.arabicQuery.text).not.toMatch(/\bيجب\b/);
    const makruh = findConcepts("Is it makruh to pray at sunrise?").map((item) => item.id);
    expect(makruh).toContain("makruh");
    expect(makruh).not.toContain("haram");
    const sunnah = findConcepts("کیا یہ سنت ہے یا واجب؟").map((item) => item.id);
    expect(sunnah).toEqual(expect.arrayContaining(["sunnah", "wajib"]));
  });

  it("does not match a Latin registry term inside an unrelated word", () => {
    expect(findConcepts("the tribal council afforded a forward pass").map((item) => item.id)).toEqual([]);
    expect(findConcepts("I will travel tomorrow").map((item) => item.id)).not.toContain("wasiyyah");
  });

  it("warns instead of inventing queries when no term is recognised", () => {
    const result = processQuestion("What should I do about this situation?");
    expect(result.arabicQuery).toEqual({ text: null, method: "none", model: null });
    expect(result.urduQuery).toEqual({ text: null, method: "none", model: null });
    expect(result.warnings.join(" ")).toMatch(/No fiqh term/);
    expect(result.variants.map((item) => item.id)).toEqual(["original", "normalized"]);
  });

  it("uses a configured provider for the non-source language only and keeps the source language query", async () => {
    const calls: string[][] = [];
    const translator = {
      id: "stub",
      available: () => true,
      translate: async (_text: string, languages: string[]) => {
        calls.push(languages);
        return languages.map((language) => ({ language, text: language === "ar" ? "هل تجب الزكاة على المال المدخر" : "کیا جمع شدہ رقم پر زکوٰۃ واجب ہے", model: "stub-model" }));
      },
    };
    const fromArabic = await processQuestionWithProvider(AR, { translator });
    expect(calls.at(-1)).toEqual(["ur"]);
    expect(fromArabic.arabicQuery.method).toBe("source_language");
    expect(fromArabic.urduQuery).toEqual({ text: "کیا جمع شدہ رقم پر زکوٰۃ واجب ہے", method: "provider", model: "stub-model" });
    const fromEnglish = await processQuestionWithProvider(EN, { translator });
    expect(calls.at(-1)).toEqual(["ar", "ur"]);
    expect(fromEnglish.arabicQuery.method).toBe("provider");
    expect(fromEnglish.urduQuery.method).toBe("provider");
    expect(fromEnglish.translationMethod).toBe("provider");
    expect(fromEnglish.variants.filter((item) => item.kind === "translation")).toHaveLength(2);
    expect(fromEnglish.original).toBe(EN);
    const unavailable = await processQuestionWithProvider(EN, { translator: { id: "u", available: () => false, translate: async () => [] } });
    expect(unavailable.translationMethod).toBe("glossary_terms_only");
    expect(unavailable.arabicQuery.method).toBe("terminology");
  });
});
