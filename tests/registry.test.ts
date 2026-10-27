import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { resolveAuthSecret } from "@/server/runtime";
import { defaultAnswerLocale, isSupportedLanguage, listLanguages, listLocales, SOURCE_LANGUAGES, SUPPORTED_LANGUAGES } from "@/data/languages";
import { getCopy, messageLocales, NO_EVIDENCE_EN, uiStrings } from "@/data/messages";
import { INSTITUTIONS, LOCAL_BOOK_FILES } from "@/data/sources";
import { MADHHABS, parseMadhhab } from "@/server/madhhab";

describe("schools and languages", () => {
  it("keeps exactly four Sunni schools and rejects a fifth", () => {
    expect(MADHHABS).toEqual(["hanafi", "maliki", "shafii", "hanbali"]);
    expect(MADHHABS.join(" ")).not.toMatch(/jafari|ja'fari/i);
    expect(() => parseMadhhab("jafari")).toThrow("INVALID_MADHHAB");
    expect(() => parseMadhhab("Ja'fari")).toThrow("INVALID_MADHHAB");
  });

  it("offers exactly English, Urdu and Arabic and nothing else", () => {
    const languages = listLanguages();
    expect(languages.map((item) => item.id)).toEqual(["en", "ur", "ar"]);
    expect(languages.map((item) => item.iso6393)).toEqual(["eng", "urd", "arb"]);
    expect(languages.map((item) => item.nativeName)).toEqual(["English", "اردو", "العربية"]);
    expect(SUPPORTED_LANGUAGES).toEqual(["en", "ur", "ar"]);
    expect(SOURCE_LANGUAGES).toEqual(["ar", "ur"]);
    expect(listLocales()).toHaveLength(3);
    const text = JSON.stringify(languages);
    for (const banned of ["Spanish", "Chinese", "Hindi", "Bengali", "French", "Hausa", "zh-Hans", "ar-EG", "Turkish"]) expect(text).not.toContain(banned);
    expect(isSupportedLanguage("es")).toBe(false);
    expect(isSupportedLanguage("ur")).toBe(true);
    expect(messageLocales()).toEqual(["en", "ur", "ar"]);
    expect(() => getCopy("es")).toThrow("INVALID_LOCALE");
  });

  it("defaults the answer language to the detected question language only when supported", () => {
    expect(defaultAnswerLocale("ar")).toBe("ar");
    expect(defaultAnswerLocale("ur")).toBe("ur");
    expect(defaultAnswerLocale("ur-Latn")).toBe("ur");
    expect(defaultAnswerLocale("en")).toBe("en");
    expect(defaultAnswerLocale("und")).toBe("en");
    expect(defaultAnswerLocale("es")).toBe("en");
    expect(defaultAnswerLocale(null, "ur")).toBe("ur");
  });

  it("sets direction, placeholder, interface strings and a no-evidence message for every locale", () => {
    for (const locale of listLocales()) {
      const copy = getCopy(locale.localeId);
      expect(copy.noEvidence.length).toBeGreaterThan(20);
      expect(copy.ui.findAnswer.length).toBeGreaterThan(2);
      expect(uiStrings(locale.localeId)).toEqual(copy.ui);
      expect(locale.questionPlaceholder.length).toBeGreaterThan(10);
      if (locale.localeId === "en") {
        expect(copy.noEvidence).toBe(NO_EVIDENCE_EN);
        expect(copy.nativeReview).toBe("author");
        expect(copy.canonicalEnglish).toBeNull();
        expect(locale.direction).toBe("ltr");
        expect(locale.retrievalRole).toBe("bridged");
      } else {
        expect(copy.nativeReview).toBe("pending");
        expect(copy.canonicalEnglish).toBe(NO_EVIDENCE_EN);
        expect(locale.direction).toBe("rtl");
        expect(locale.retrievalRole).toBe("source");
        expect(/[\u0600-\u06FF]/.test(copy.noEvidence)).toBe(true);
        expect(/[\u0600-\u06FF]/.test(locale.questionPlaceholder)).toBe(true);
      }
    }
    expect(uiStrings("es").findAnswer).toBe("Find Answer");
  });

  it("keeps a local account secret when AUTH_SECRET is empty", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "fiqh-auth-")), "auth-secret");
    const first = resolveAuthSecret("", file);
    const second = resolveAuthSecret(undefined, file);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(second).toBe(first);
    expect(resolveAuthSecret("explicit-secret-value", file)).toBe("explicit-secret-value");
  });

  it("does not put any institution in a trusted retrieval pool", () => {
    expect(INSTITUTIONS.length).toBeGreaterThan(0);
    for (const institution of INSTITUTIONS) {
      expect(institution.trustedPool).toEqual([]);
      expect(institution.retrievalAllowed).toBe(false);
    }
    expect(LOCAL_BOOK_FILES.every((file) => file.status === "rights_review_required")).toBe(true);
    const hashes = LOCAL_BOOK_FILES.map((file) => file.sha256);
    expect(new Set(hashes).size).toBe(hashes.length - 1);
  });
});
