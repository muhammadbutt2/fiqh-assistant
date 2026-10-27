// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listLocales } from "@/data/languages";
import Page from "@/app/page";
import { AnswerPanel } from "@/components/AnswerPanel";
import { AskScreen } from "@/components/AskScreen";
import { NO_EVIDENCE_EN } from "@/data/messages";
import type { PublicAnswer } from "@/server/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function answer(locale: string, directionLanguage = "ar"): PublicAnswer {
  return {
    questionOriginal: "A synthetic question",
    detectedQueryLanguage: "en",
    detectionUncertain: false,
    preferredAnswerLanguage: locale,
    madhhab: "hanafi",
    answerStatus: "insufficient_evidence",
    answer: locale === "en" ? NO_EVIDENCE_EN : "draft",
    evidenceSummary: "No approved passage was available.",
    citations: [{
      sourceId: "cite-1",
      sourceType: "primary",
      title: "TEST FIXTURE",
      author: "Synthetic",
      edition: null,
      language: directionLanguage,
      volume: null,
      printedPages: null,
      pdfPages: { start: 2, end: 2 },
      chapter: [],
      originalExcerpt: "اقتباس",
      translatedExcerpt: null,
      translationStatus: "none",
      url: null,
      fatwaNumber: null,
      verificationStatus: "verified",
      opinionLabels: [],
      testFixture: true,
    }],
    uncertainties: [],
    humanReviewRecommended: true,
    limitations: [],
    answerGenerationVersion: "2026-10-26.1",
    promptVersion: "2026-10-26.1",
    notAMufti: true,
    nativeReview: locale === "en" ? "author" : "pending",
    canonicalEnglish: locale === "en" ? null : NO_EVIDENCE_EN,
    translationMethod: "original_only",
    translationModel: null,
    translationFallback: locale !== "en",
    semanticRetrieval: "unavailable",
    retrievalLanguages: ["en"],
    sourceIds: ["cite-1"],
    variantIds: [],
    highStakes: false,
    unresolvedDisagreement: false,
  };
}

describe("interface", () => {
  it("shows the required landing copy and four schools", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Find Clarity in Your");
    expect(screen.getByText(/Ask your question in your own language/)).toBeTruthy();
    expect(screen.getAllByRole("button", { pressed: false }).map((button) => button.textContent).join(" ")).not.toMatch(/Ja'fari|Jafari/);
    for (const name of ["Hanafi", "Maliki", "Shafi'i", "Hanbali"]) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeTruthy();
    }
  });

  it("renders exactly English, اردو and العربية with their directions", () => {
    render(<Page />);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options.map((node) => node.querySelector("strong")?.textContent)).toEqual(["English", "اردو", "العربية"]);
    for (const locale of listLocales()) {
      const option = options.find((node) => node.getAttribute("lang") === locale.bcp47);
      expect(option?.getAttribute("dir")).toBe(locale.direction);
      expect(option?.textContent).toContain(locale.nativeName);
    }
    expect(document.body.textContent).not.toMatch(/Español|中文|हिन्दी|বাংলা|Hausa|total-speaker/);
  });

  it("switches the landing question box to RTL with a native placeholder when Urdu or Arabic is chosen", () => {
    render(<Page />);
    const box = document.getElementById("masla") as HTMLTextAreaElement;
    expect(box.getAttribute("dir")).toBe("auto");
    fireEvent.click(screen.getByRole("option", { name: /اردو/ }));
    expect(box.getAttribute("dir")).toBe("rtl");
    expect(box.getAttribute("lang")).toBe("ur");
    expect(box.placeholder).toMatch(/مسئلہ/);
    fireEvent.click(screen.getByRole("option", { name: /English/ }));
    expect(box.getAttribute("dir")).toBe("ltr");
    expect(box.placeholder).toMatch(/masla/i);
  });

  it("sets Arabic and Urdu answers to RTL and English to LTR, and keeps an Arabic quotation RTL inside an English answer", () => {
    for (const locale of ["ar", "ur"]) {
      const { unmount } = render(<AnswerPanel answer={answer(locale, locale === "ur" ? "ur" : "ar")} />);
      expect(screen.getByRole("article").getAttribute("dir")).toBe("rtl");
      expect(screen.getByRole("article").getAttribute("lang")).toBe(locale);
      expect(screen.getByText("اقتباس").getAttribute("dir")).toBe("rtl");
      expect(screen.getByText(/not recorded/)).toBeTruthy();
      expect(screen.getByText(/No review has taken place|has not arranged that review/)).toBeTruthy();
      unmount();
    }
    const { unmount } = render(<AnswerPanel answer={answer("en", "ar")} />);
    expect(screen.getByRole("article").getAttribute("dir")).toBe("ltr");
    expect(screen.getByText("اقتباس").getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("اقتباس").getAttribute("lang")).toBe("ar");
    expect(screen.getByText(/PDF page index 2/)).toBeTruthy();
    unmount();
  });

  it("shows the query summary and no fabricated printed page", () => {
    const withSummary: PublicAnswer = {
      ...answer("en", "ar"),
      querySummary: {
        detectedLanguage: "en",
        detectionConfidence: "medium",
        arabicQuery: { text: "زكاة المال المدخر", method: "terminology" },
        urduQuery: { text: "جمع شدہ مال پر زکوٰۃ", method: "terminology" },
        concepts: ["zakat", "intent_obligation"],
        negations: ["not"],
        conditions: ["if"],
        numbers: [],
        ambiguities: [],
        warnings: ["terminology strings"],
      },
    };
    render(<AnswerPanel answer={withSummary} />);
    expect(screen.getByText(/How this question was searched/)).toBeTruthy();
    expect(screen.getByText("زكاة المال المدخر").getAttribute("dir")).toBe("rtl");
    expect(screen.getByText(/Negations kept: not/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/Printed page not recorded/);
    expect(document.body.textContent).not.toMatch(/p\. \d/);
  });

  it("keeps the question when the request fails and says the library is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ libraryPopulated: false }), { status: 200 })));
    window.localStorage.setItem("fiqh.prefs.v1", JSON.stringify({ madhhab: "shafii", localeId: "ur" }));
    render(<AskScreen ask={async () => { throw new Error("REQUEST_FAILED"); }} />);
    expect(await screen.findByText(/library is not populated/)).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Question" });
    expect(await screen.findByText("Shafi'i", { selector: "strong" })).toBeTruthy();
    expect(box.getAttribute("dir")).toBe("rtl");
    expect(box.getAttribute("lang")).toBe("ur");
    fireEvent.change(box, { target: { value: "میرا سوال یہیں رہے گا" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("REQUEST_FAILED")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("میرا سوال یہیں رہے گا");
  });

  it("ignores an unsupported saved locale and offers the three languages plus a detect-from-question default", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ libraryPopulated: false }), { status: 200 })));
    window.localStorage.setItem("fiqh.prefs.v1", JSON.stringify({ madhhab: "hanafi", localeId: "fr" }));
    const sent: unknown[] = [];
    render(<AskScreen ask={async (body) => { sent.push(body); return { ...answer("ur", "ar"), id: "x" }; }} />);
    expect(await screen.findByText("Hanafi", { selector: "strong" })).toBeTruthy();
    const select = screen.getByRole("combobox", { name: "Answer language" }) as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["", "en", "ur", "ar"]);
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: "کیا جمع شدہ رقم پر زکوٰۃ واجب ہے؟" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("article")).toBeTruthy();
    expect(sent[0]).toEqual({ madhhab: "hanafi", question: "کیا جمع شدہ رقم پر زکوٰۃ واجب ہے؟" });
    expect(select.value).toBe("ur");
  });
});
