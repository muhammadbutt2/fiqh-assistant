import { describe, expect, it } from "vitest";
import { answerQuestion } from "@/server/answer";
import { diagnoseRetrieval } from "@/server/diagnose";
import { selectChunks } from "@/server/retrieve";
import { buildVariants, detectLanguage } from "@/server/text";
import { fixture } from "./fixtures";

/**
 * Controlled terminology retrieval on synthetic passages.
 * This does not measure Tesseract, embeddings, or the real books.
 * The real PDFs are not searchable until calibration and approval.
 */

const ZAKAT = "تجب الزكاة في المال المدخر إذا بلغ النصاب وحال عليه الحول TEST FIXTURE";
const SALAH = "الصلاة واجبة على المسلم في وقتها TEST FIXTURE";

const QUESTIONS = [
  ["en", "Do I have to pay zakat on my savings?"],
  ["ur", "کیا جمع شدہ رقم پر زکوٰۃ واجب ہے؟"],
  ["ur-Latn", "Kya meri savings par zakat wajib hai?"],
  ["ar", "هل تجب الزكاة على الأموال المدخرة؟"],
  ["es", "¿Tengo que pagar el zakat por mis ahorros?"],
  ["fr", "Dois-je payer la zakat sur mon épargne?"],
  ["tr", "Birikimlerim için zekât vermem gerekir mi?"],
  ["zh", "我的存款需要缴纳天课吗？"],
  ["hi", "क्या मेरी बचत पर ज़कात देनी है?"],
  ["bn", "আমার সঞ্চয়ের উপর যাকাত দিতে হবে?"],
] as const;

describe("cross-language terminology retrieval", () => {
  const hanafi = fixture({ id: "zakat-h", madhhab: "hanafi", originalText: ZAKAT, isTestFixture: false, pdfPageStart: 14, pdfPageEnd: 14 });
  const maliki = fixture({ id: "zakat-m", madhhab: "maliki", originalText: ZAKAT, isTestFixture: false });
  const salah = fixture({ id: "salah-h", madhhab: "hanafi", originalText: SALAH, isTestFixture: false });
  const unmeasured = fixture({ id: "zakat-ocr", madhhab: "hanafi", originalText: ZAKAT, ocrQuality: "unmeasured", isTestFixture: false });
  const chunks = [salah, maliki, unmeasured, hanafi];

  it.each(QUESTIONS)("finds the Hanafi zakat passage from %s", (language, question) => {
    const built = buildVariants(question, detectLanguage(question));
    expect(built.variants.some((item) => item.language === "ar" && item.text.includes("زكاة"))).toBe(true);
    expect(built.variants.some((item) => item.language === "ur" && item.text.includes("زکوٰۃ"))).toBe(true);
    if (language !== "ur" && language !== "ar") {
      expect(built.method).toBe("glossary_terms_only");
      expect(built.model).toBeNull();
    }
    const selected = selectChunks({ chunks, madhhab: "hanafi", variants: built.variants, allowTestFixtures: false, limit: 10 });
    const rank = selected.findIndex((item) => item.id === "zakat-h");
    expect(rank).toBeGreaterThanOrEqual(0);
    expect(rank).toBeLessThan(5);
    expect(selected.map((item) => item.id)).not.toContain("zakat-m");
    expect(selected.map((item) => item.id)).not.toContain("zakat-ocr");
  });

  it("does not turn sadaqah into a zakat query", () => {
    const built = buildVariants("Is sadaqah the same as general charity?", detectLanguage("Is sadaqah the same as general charity?"));
    const arabic = built.variants.find((item) => item.id === "glossary-ar")?.text ?? "";
    expect(arabic).toContain("صدقة");
    expect(arabic).not.toContain("زكاة");
  });

  it("keeps the madhhab filter when the question is not Arabic", async () => {
    const answer = await answerQuestion({
      madhhab: "maliki",
      answerLocale: "es",
      question: "¿Tengo que pagar el zakat por mis ahorros?",
      chunks,
      allowTestFixtures: false,
      libraryEmpty: false,
      chat: null,
    });
    expect(answer.madhhab).toBe("maliki");
    expect(answer.citations.map((item) => item.sourceId)).toEqual(["zakat-m"]);
    expect(answer.citations[0]?.originalExcerpt).toContain("الزكاة");
    expect(answer.citations[0]?.pdfPages.start).toBe(1);
    expect(answer.preferredAnswerLanguage).toBe("es");
    expect(answer.semanticRetrieval).toBe("unavailable");
    expect(answer.answerStatus).not.toBe("answered");
  });

  it("reports an admin trace without treating terminology search as a measured translation", () => {
    const report = diagnoseRetrieval({ question: "Do I have to pay zakat on my savings?", madhhab: "hanafi", chunks });
    expect(report.detectedLanguage).toBe("en");
    expect(report.arabicQuery).toContain("زكاة المال المدخر");
    expect(report.urduQuery).toContain("زکوٰۃ");
    expect(report.semanticRetrieval).toBe("unavailable");
    expect(report.candidates[0]?.sourceId).toBe("zakat-h");
    expect(report.note).toContain("Unmeasured OCR is excluded");
  });
});
