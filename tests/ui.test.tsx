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

  it("renders every answer language with its direction", () => {
    render(<Page />);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(21);
    for (const locale of listLocales()) {
      const option = options.find((node) => node.getAttribute("lang") === locale.bcp47);
      expect(option?.getAttribute("dir")).toBe(locale.direction);
      expect(option?.textContent).toContain(locale.nativeName);
    }
  });

  it("sets Arabic and Urdu answers to RTL and English, Spanish, and French to LTR", () => {
    for (const locale of ["ar", "ur", "ar-EG"]) {
      const { unmount } = render(<AnswerPanel answer={answer(locale, locale === "ur" ? "ur" : "ar")} />);
      expect(screen.getByRole("article").getAttribute("dir")).toBe("rtl");
      expect(screen.getByText("اقتباس").getAttribute("dir")).toBe("rtl");
      expect(screen.getByText(/not recorded/)).toBeTruthy();
      expect(screen.getByText(/No review has taken place|has not arranged that review/)).toBeTruthy();
      unmount();
    }
    for (const locale of ["en", "es", "fr"]) {
      const { unmount } = render(<AnswerPanel answer={answer(locale, "en")} />);
      expect(screen.getByRole("article").getAttribute("dir")).toBe("ltr");
      expect(screen.getByText("اقتباس").getAttribute("dir")).toBe("ltr");
      unmount();
    }
  });

  it("keeps the question when the request fails and says the library is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ libraryPopulated: false }), { status: 200 })));
    window.localStorage.setItem("fiqh.prefs.v1", JSON.stringify({ madhhab: "shafii", localeId: "fr" }));
    render(<AskScreen ask={async () => { throw new Error("REQUEST_FAILED"); }} />);
    expect(await screen.findByText(/library is not populated/)).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Question" });
    fireEvent.change(box, { target: { value: "Ma question reste ici" } });
    expect(await screen.findByText("Shafi'i", { selector: "strong" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("REQUEST_FAILED")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("Ma question reste ici");
  });
});
