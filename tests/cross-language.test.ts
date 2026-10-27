import { describe, expect, it } from "vitest";
import { answerQuestion } from "@/server/answer";
import { diagnoseRetrieval } from "@/server/diagnose";
import { processQuestion } from "@/server/query";
import { selectChunks } from "@/server/retrieve";
import { buildVariants, detectLanguage } from "@/server/text";
import { fixture } from "./fixtures";

/**
 * Controlled three-language terminology retrieval on synthetic passages.
 * This does not measure Tesseract, embeddings, or the real books.
 * The real PDFs are not searchable until calibration and approval.
 */

const ZAKAT = "تجب الزكاة في المال المدخر إذا بلغ النصاب وحال عليه الحول TEST FIXTURE";
const ZAKAT_UR = "جمع شدہ مال پر زکوٰۃ واجب ہے جب وہ نصاب کو پہنچ جائے اور اس پر سال گزر جائے TEST FIXTURE";
const SALAH = "الصلاة واجبة على المسلم في وقتها TEST FIXTURE";
const SADAQAH = "صدقة التطوع مستحبة في كل وقت TEST FIXTURE";

const QUESTIONS = [
  ["en", "Do I have to pay zakat on my savings?"],
  ["ur", "کیا جمع شدہ رقم پر زکوٰۃ واجب ہے؟"],
  ["ur", "کیا میرے جمع شدہ پیسوں پر زکوٰۃ واجب ہے؟"],
  ["ur-Latn", "Kya meri savings par zakat wajib hai?"],
  ["ar", "هل تجب الزكاة على الأموال المدخرة؟"],
  ["ar", "هل تجب الزكاة على المال المدخر؟"],
] as const;

describe("three-language terminology retrieval", () => {
  const hanafi = fixture({ id: "zakat-h", madhhab: "hanafi", originalText: ZAKAT, isTestFixture: false, pdfPageStart: 14, pdfPageEnd: 14 });
  const hanafiUrdu = fixture({ id: "zakat-h-ur", madhhab: "hanafi", language: "ur", originalText: ZAKAT_UR, isTestFixture: false, title: "TEST FIXTURE Urdu manual" });
  const maliki = fixture({ id: "zakat-m", madhhab: "maliki", originalText: ZAKAT, isTestFixture: false });
  const salah = fixture({ id: "salah-h", madhhab: "hanafi", originalText: SALAH, isTestFixture: false });
  const sadaqah = fixture({ id: "sadaqah-h", madhhab: "hanafi", originalText: SADAQAH, isTestFixture: false });
  const unmeasured = fixture({ id: "zakat-ocr", madhhab: "hanafi", originalText: ZAKAT, ocrQuality: "unmeasured", isTestFixture: false });
  const chunks = [salah, maliki, unmeasured, sadaqah, hanafiUrdu, hanafi];

  it.each(QUESTIONS)("finds the Hanafi Arabic and Urdu zakat passages from a %s question", (language, question) => {
    const detection = detectLanguage(question);
    expect(detection.language).toBe(language);
    const built = buildVariants(question, detection);
    expect(built.variants.some((item) => item.language === "ar" && item.text.includes("زكاة"))).toBe(true);
    expect(built.variants.some((item) => item.language === "ur" && item.text.includes("زکوٰۃ"))).toBe(true);
    expect(built.model).toBeNull();
    expect(built.variants[0]).toMatchObject({ id: "original", text: question });
    const selected = selectChunks({ chunks, madhhab: "hanafi", variants: built.variants, allowTestFixtures: false, limit: 10 });
    const ids = selected.map((item) => item.id);
    expect(ids.indexOf("zakat-h")).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf("zakat-h")).toBeLessThan(5);
    expect(ids.indexOf("zakat-h-ur")).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf("zakat-h-ur")).toBeLessThan(5);
    expect(ids).not.toContain("zakat-m");
    expect(ids).not.toContain("zakat-ocr");
    expect(ids.indexOf("zakat-h")).toBeLessThan(ids.indexOf("sadaqah-h") === -1 ? 99 : ids.indexOf("sadaqah-h"));
  });

  it("does not turn sadaqah into a zakat query, and keeps both when both are asked", () => {
    const sadaqahOnly = processQuestion("Is sadaqah the same as general charity?");
    expect(sadaqahOnly.arabicQuery.text).toContain("صدقة");
    expect(sadaqahOnly.arabicQuery.text).not.toContain("زكاة");
    expect(sadaqahOnly.concepts.map((item) => item.id)).not.toContain("zakat");
    const both = processQuestion("Can I count my sadaqah as zakat?");
    expect(both.concepts.map((item) => item.id)).toEqual(expect.arrayContaining(["zakat", "sadaqah"]));
    expect(both.ambiguities.join(" ")).toMatch(/zakat and sadaqah/i);
  });

  it("keeps the madhhab filter when the question is not Arabic", async () => {
    const answer = await answerQuestion({
      madhhab: "maliki",
      answerLocale: "en",
      question: "Do I have to pay zakat on my savings?",
      chunks,
      allowTestFixtures: false,
      libraryEmpty: false,
      chat: null,
    });
    expect(answer.madhhab).toBe("maliki");
    expect(answer.citations.map((item) => item.sourceId)).toEqual(["zakat-m"]);
    expect(answer.citations[0]?.originalExcerpt).toContain("الزكاة");
    expect(answer.citations[0]?.pdfPages.start).toBe(1);
    expect(answer.preferredAnswerLanguage).toBe("en");
    expect(answer.semanticRetrieval).toBe("unavailable");
    expect(answer.answerStatus).not.toBe("answered");
    expect(answer.querySummary?.arabicQuery.text).toContain("زكاة المال المدخر");
  });

  it("answers in the selected language regardless of the question language", async () => {
    const pairs: [string, string][] = [["en", "ur"], ["ur", "ar"], ["ar", "en"]];
    for (const [questionLanguage, answerLocale] of pairs) {
      const question = QUESTIONS.find(([language]) => language === questionLanguage)?.[1] ?? "";
      const answer = await answerQuestion({ madhhab: "hanafi", answerLocale, question, chunks, chat: null });
      expect(answer.detectedQueryLanguage).toBe(questionLanguage);
      expect(answer.preferredAnswerLanguage).toBe(answerLocale);
      expect(answer.questionOriginal).toBe(question);
      expect(answer.sourceIds).toContain("zakat-h");
    }
  });

  it("reports an admin trace without treating terminology search as a measured translation", async () => {
    const report = await diagnoseRetrieval({ question: "Do I have to pay zakat on my savings?", madhhab: "hanafi", chunks });
    expect(report.detectedLanguage).toBe("en");
    expect(report.arabicQuery).toContain("زكاة المال المدخر");
    expect(report.arabicQueryMethod).toBe("terminology");
    expect(report.urduQuery).toContain("زکوٰۃ");
    expect(report.semanticRetrieval).toBe("unavailable");
    expect(report.candidates.slice(0, 2).map((item) => item.sourceId).sort()).toEqual(["zakat-h", "zakat-h-ur"]);
    expect(report.candidates.map((item) => item.sourceId)).not.toContain("zakat-m");
    expect(report.unapprovedCandidatesForMadhhab).toBe(1);
    expect(report.unapprovedMatches.map((item) => item.sourceId)).toContain("zakat-ocr");
    expect(report.websitesSkipped.length).toBeGreaterThan(0);
    expect(report.note).toContain("labelled candidates");
  });
});
