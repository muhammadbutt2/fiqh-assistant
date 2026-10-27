import { describe, expect, it } from "vitest";
import { NO_EVIDENCE_EN } from "@/data/messages";
import { INSTITUTIONS, normalizeInstitution } from "@/data/sources";
import { answerQuestion } from "@/server/answer";
import { unavailableChat } from "@/server/ai";
import { diagnoseRetrieval } from "@/server/diagnose";
import { researchQuestion } from "@/server/research";
import { scorePassageRelevance, selectChunks } from "@/server/retrieve";
import { buildVariants, detectLanguage } from "@/server/text";
import { fixture } from "./fixtures";

const ZAKAT = "تجب الزكاة في المال المدخر إذا بلغ النصاب وحال عليه الحول TEST FIXTURE";
const PARTNERSHIP = "يجوز عقد الشركة بين الشريكين في المال TEST FIXTURE";
const KAABA_PRAYER = "الصلاة داخل الكعبة صحيحة على هذا الوجه TEST FIXTURE";
const SALAH = "الصلاة واجبة على المسلم في وقتها TEST FIXTURE";
const WUDU = "ينتقض الوضوء بالنوم العميق TEST FIXTURE";

const foundMuftiwp = INSTITUTIONS.find((item) => item.id === "mufti-wilayah-persekutuan");
if (!foundMuftiwp) throw new Error("muftiwp seed missing");
const MUFTIWP = foundMuftiwp;

function enabledMuftiwp() {
  return normalizeInstitution({ ...MUFTIWP, retrievalAllowed: true, trustedPool: ["shafii"] });
}

const WUDU_BODY = "This official article explains wudu and prayer for the Federal Territories. The Mufti ordinarily follows the accepted Shafi'i view under Act 505. ".repeat(3);
const WUDU_HTML = `<html><head><title>Irsyad Hukum: Wudu before prayer</title></head><body><div itemprop="articleBody">${WUDU_BODY}</div></body></html>`;
const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title><![CDATA[Wudu before prayer]]></title><link>https://www.muftiwp.gov.my/en/artikel/irsyad-hukum/umum/100-wudu</link><description>short snippet about ablution</description></item>
</channel></rss>`;

function mockWuduFetch(): typeof fetch {
  return (async (url) => {
    const href = String(url);
    if (href.includes("robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 404 });
    if (href.includes("format=feed") || href.includes("/carian?")) return new Response(RSS, { status: 200 });
    if (href.includes("/en/artikel/") || href.includes("/ms/artikel/")) return new Response(WUDU_HTML, { status: 200 });
    return new Response("not fetched", { status: 404 });
  }) as typeof fetch;
}

describe("research relevance and answer template", () => {
  it("does not keep an off-topic neighbouring PDF page just because it is next to a match", async () => {
    const match = fixture({ id: "wudu-10", documentId: "quduri", madhhab: "hanafi", originalText: WUDU, pdfPageStart: 10, pdfPageEnd: 10, isTestFixture: false });
    const sales = fixture({ id: "sales-11", documentId: "quduri", madhhab: "hanafi", originalText: PARTNERSHIP, pdfPageStart: 11, pdfPageEnd: 11, isTestFixture: false });
    const answer = await answerQuestion({
      madhhab: "hanafi",
      answerLocale: "en",
      question: "What invalidates wudu?",
      chunks: [match, sales],
      chat: unavailableChat(),
    });
    expect(answer.sourceIds).toEqual(["wudu-10"]);
    expect(answer.research?.neighborsAdded).toBe(0);
  });

  it("does not cite partnership or prayer passages for a zakat question", async () => {
    const zakat = fixture({ id: "zakat-ok", madhhab: "hanafi", originalText: ZAKAT, isTestFixture: false });
    const partnership = fixture({ id: "shirkah", madhhab: "hanafi", originalText: PARTNERSHIP, isTestFixture: false });
    const prayer = fixture({ id: "kaaba", madhhab: "hanafi", originalText: KAABA_PRAYER, isTestFixture: false });
    const answer = await answerQuestion({
      madhhab: "hanafi",
      answerLocale: "en",
      question: "Do I have to pay zakat on my savings?",
      chunks: [partnership, prayer, zakat],
      chat: unavailableChat(),
    });
    expect(answer.sourceIds).toEqual(["zakat-ok"]);
    expect(answer.citations[0]?.originalExcerpt).toContain("الزكاة");
    expect(answer.presentation?.bookEvidence.map((item) => item.sourceId)).toEqual(["zakat-ok"]);
    expect(answer.research?.rejectedIrrelevant).toBeGreaterThan(0);
  });

  it("retrieves prayer evidence for a prayer question, not a zakat keyword neighbour", () => {
    const salah = fixture({ id: "salah-ok", madhhab: "hanafi", originalText: SALAH, isTestFixture: false });
    const zakat = fixture({ id: "zakat-other", madhhab: "hanafi", originalText: ZAKAT, isTestFixture: false });
    const selected = selectChunks({
      chunks: [salah, zakat],
      madhhab: "hanafi",
      variants: buildVariants("Is the ritual prayer obligatory?", detectLanguage("Is the ritual prayer obligatory?")).variants,
      allowTestFixtures: false,
    });
    expect(selected.map((item) => item.id)).toEqual(["salah-ok"]);
  });

  it("rejects an unmeasured OCR passage as verified evidence", () => {
    expect(scorePassageRelevance("Do I have to pay zakat on my savings?", PARTNERSHIP).relevant).toBe(false);
    expect(scorePassageRelevance("Do I have to pay zakat on my savings?", KAABA_PRAYER).relevant).toBe(false);
    expect(scorePassageRelevance("Do I have to pay zakat on my savings?", ZAKAT).relevant).toBe(true);
  });

  it("does not use a Shafi'i-only institutional source as a Hanafi ruling", async () => {
    const answer = await answerQuestion({
      madhhab: "hanafi",
      answerLocale: "en",
      question: "Is wudu required before prayer?",
      chunks: [],
      institutions: [enabledMuftiwp()],
      fetchImpl: mockWuduFetch(),
      chat: unavailableChat(),
    });
    expect(answer.evidenceRole).toBe("none");
    expect(answer.citations).toEqual([]);
    expect(answer.madhhab).toBe("hanafi");
    expect(answer.limitations.join(" ")).toMatch(/trusted pool|not used/i);
    expect(answer.research?.websitesSearched).toBe(0);
  });

  it("uses the enabled Shafi'i website only when the retrieved article is relevant", async () => {
    const relevant = await answerQuestion({
      madhhab: "shafii",
      answerLocale: "en",
      question: "Is wudu required before prayer?",
      chunks: [],
      institutions: [enabledMuftiwp()],
      fetchImpl: mockWuduFetch(),
      chat: unavailableChat(),
    });
    expect(relevant.evidenceRole).toBe("institutional");
    expect(relevant.citations[0]?.url).toContain("/en/artikel/");
    expect(relevant.presentation?.websiteEvidence[0]?.url).toContain("/en/artikel/");
    expect(relevant.presentation?.bookEvidence).toEqual([]);

    const offTopic = await answerQuestion({
      madhhab: "shafii",
      answerLocale: "en",
      question: "Do I have to pay zakat on my savings?",
      chunks: [],
      institutions: [enabledMuftiwp()],
      fetchImpl: mockWuduFetch(),
      chat: unavailableChat(),
    });
    expect(offTopic.evidenceRole).toBe("none");
    expect(offTopic.citations).toEqual([]);
    expect(offTopic.research?.websitesSearched).toBe(1);
    expect(offTopic.research?.websiteHits).toBe(0);
  });

  it("does not describe a disabled website as searched", async () => {
    const result = await researchQuestion({
      chunks: [],
      madhhab: "hanafi",
      variants: buildVariants("Do I have to pay zakat on my savings?", detectLanguage("Do I have to pay zakat on my savings?")).variants,
      allowTestFixtures: false,
      institutions: INSTITUTIONS,
      fetchImpl: async () => new Response("no"),
    });
    expect(result.websites.searched).toEqual([]);
    expect(result.summary.websitesSearched).toBe(0);
    expect(result.summary.searchMethods.join(" ")).not.toMatch(/OpenSearch/);
    expect(result.websites.skipped.every((item) => item.reason.includes("retrievalAllowed") || item.reason.includes("trusted pool") || item.reason.includes("No compliant"))).toBe(true);
  });

  it("resolves every displayed citation to a real retrieved record", async () => {
    const chunk = fixture({ id: "cite-real", madhhab: "hanafi", originalText: ZAKAT, isTestFixture: false, title: "Mukhtasar", author: "Al-Quduri" });
    const answer = await answerQuestion({
      madhhab: "hanafi",
      answerLocale: "en",
      question: "Do I have to pay zakat on my savings?",
      chunks: [chunk],
      chat: unavailableChat(),
    });
    expect(answer.citations).toHaveLength(1);
    expect(answer.sourceIds).toEqual(["cite-real"]);
    expect(answer.presentation?.sources).toHaveLength(1);
    expect(answer.presentation?.sources[0]?.sourceId).toBe("cite-real");
    expect(answer.presentation?.bookEvidence[0]?.originalExcerpt).toContain("الزكاة");
  });

  it("produces the no-evidence state when only unmeasured OCR or unrelated text exists", async () => {
    const draft = fixture({
      id: "ocr-only",
      madhhab: "hanafi",
      originalText: ZAKAT,
      ocrQuality: "unmeasured",
      searchable: false,
      trustClassification: "pending",
      verificationStatus: "pending",
      rightsStatus: "rights_review_required",
      isTestFixture: false,
    });
    const unrelated = fixture({ id: "sales", madhhab: "hanafi", originalText: PARTNERSHIP, isTestFixture: false });
    const answer = await answerQuestion({
      madhhab: "hanafi",
      answerLocale: "en",
      question: "Do I have to pay zakat on my savings?",
      chunks: [draft, unrelated],
      chat: unavailableChat(),
    });
    expect(answer.answerStatus).toBe("insufficient_evidence");
    expect(answer.answer).toBe(NO_EVIDENCE_EN);
    expect(answer.citations).toEqual([]);
    expect(answer.presentation?.bookEvidence).toEqual([]);
    expect(answer.presentation?.websiteEvidence).toEqual([]);
    expect(answer.limitations.join(" ")).toMatch(/unmeasured or unapproved|not actually about this question/i);
  });

  it("reports translation-provider failure honestly without calling it a full translation", async () => {
    const chunk = fixture({ id: "zakat-tr", madhhab: "hanafi", originalText: ZAKAT, isTestFixture: false });
    const answer = await answerQuestion({
      madhhab: "hanafi",
      answerLocale: "en",
      question: "Do I have to pay zakat on my savings?",
      chunks: [chunk],
      translator: { id: "broken", available: () => true, translate: async () => { throw new Error("boom"); } },
      chat: unavailableChat(),
    });
    expect(answer.translationMethod).toBe("provider_failed");
    expect(answer.limitations.join(" ")).toMatch(/translation failed/i);
    expect(answer.querySummary?.arabicQuery.method).not.toBe("provider");
  });

  it("writes the no-evidence and extractive answers in the selected response language", async () => {
    const emptyEn = await answerQuestion({ madhhab: "maliki", answerLocale: "en", question: "Is tayammum allowed here?", chunks: [], chat: unavailableChat() });
    const emptyUr = await answerQuestion({ madhhab: "maliki", answerLocale: "ur", question: "Is tayammum allowed here?", chunks: [], chat: unavailableChat() });
    const emptyAr = await answerQuestion({ madhhab: "maliki", answerLocale: "ar", question: "Is tayammum allowed here?", chunks: [], chat: unavailableChat() });
    expect(emptyEn.answer).toBe(NO_EVIDENCE_EN);
    expect(/[\u0600-\u06FF]/.test(emptyUr.answer)).toBe(true);
    expect(/[\u0600-\u06FF]/.test(emptyAr.answer)).toBe(true);
    expect(emptyUr.preferredAnswerLanguage).toBe("ur");
    expect(emptyAr.preferredAnswerLanguage).toBe("ar");

    const chunk = fixture({ id: "wudu-lang", madhhab: "hanafi", originalText: WUDU, isTestFixture: false });
    const ur = await answerQuestion({ madhhab: "hanafi", answerLocale: "ur", question: "What invalidates wudu?", chunks: [chunk], chat: unavailableChat() });
    const ar = await answerQuestion({ madhhab: "hanafi", answerLocale: "ar", question: "What invalidates wudu?", chunks: [chunk], chat: unavailableChat() });
    expect(ur.preferredAnswerLanguage).toBe("ur");
    expect(ar.preferredAnswerLanguage).toBe("ar");
    expect(/[\u0600-\u06FF]/.test(ur.presentation?.directAnswer ?? "")).toBe(true);
    expect(/[\u0600-\u06FF]/.test(ar.presentation?.directAnswer ?? "")).toBe(true);
  });

  it("keeps Arabic and Urdu quotations labelled with RTL-ready language metadata", async () => {
    const arabic = fixture({ id: "ar-q", madhhab: "hanafi", language: "ar", originalText: ZAKAT, isTestFixture: false });
    const urdu = fixture({
      id: "ur-q",
      madhhab: "hanafi",
      language: "ur",
      originalText: "جمع شدہ مال پر زکوٰۃ واجب ہے TEST FIXTURE",
      isTestFixture: false,
    });
    const answer = await answerQuestion({
      madhhab: "hanafi",
      answerLocale: "en",
      question: "Do I have to pay zakat on my savings?",
      chunks: [arabic, urdu],
      chat: unavailableChat(),
    });
    const languages = answer.presentation?.bookEvidence.map((item) => item.excerptLanguage) ?? [];
    expect(languages).toEqual(expect.arrayContaining(["ar", "ur"]));
    expect(answer.presentation?.bookEvidence.every((item) => item.originalExcerpt.length > 0)).toBe(true);
  });

  it("omits empty template sections and placeholder citations", async () => {
    const answer = await answerQuestion({
      madhhab: "hanbali",
      answerLocale: "en",
      question: "What is the ruling on a matter with no indexed source?",
      chunks: [],
      libraryEmpty: true,
      chat: unavailableChat(),
    });
    expect(answer.presentation?.bookEvidence).toEqual([]);
    expect(answer.presentation?.websiteEvidence).toEqual([]);
    expect(answer.presentation?.sources).toEqual([]);
    expect(answer.presentation?.disagreements).toEqual([]);
    expect(answer.citations).toEqual([]);
    expect(answer.presentation?.directAnswer).toBe(NO_EVIDENCE_EN);
  });

  it("records rejected OCR and off-topic hits in the admin trace only", async () => {
    const approved = fixture({ id: "zakat-ok", madhhab: "hanafi", originalText: ZAKAT, isTestFixture: false });
    const ocr = fixture({
      id: "ocr-draft",
      madhhab: "hanafi",
      originalText: ZAKAT,
      ocrQuality: "unmeasured",
      searchable: false,
      isTestFixture: false,
    });
    const prayer = fixture({ id: "prayer", madhhab: "hanafi", originalText: SALAH, isTestFixture: false });
    const report = await diagnoseRetrieval({
      question: "Do I have to pay zakat on my savings?",
      madhhab: "hanafi",
      chunks: [approved, ocr, prayer],
    });
    expect(report.candidates.map((item) => item.sourceId)).toEqual(["zakat-ok"]);
    expect(report.unapprovedMatches.map((item) => item.sourceId)).toContain("ocr-draft");
    expect(report.rejectedIrrelevant.some((item) => item.sourceId === "prayer")).toBe(true);
    expect(report.translationProvider).toBe("unavailable");
    expect(report.evidenceRole).toBe("approved");
  });
});
