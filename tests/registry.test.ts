import { describe, expect, it } from "vitest";
import { listLanguages, listLocales, SPEAKER_RANKING } from "@/data/languages";
import { getCopy, messageLocales, NO_EVIDENCE_EN } from "@/data/messages";
import { INSTITUTIONS, LOCAL_BOOK_FILES } from "@/data/sources";
import { MADHHABS, parseMadhhab } from "@/server/madhhab";

describe("schools and languages", () => {
  it("keeps exactly four Sunni schools and rejects a fifth", () => {
    expect(MADHHABS).toEqual(["hanafi", "maliki", "shafii", "hanbali"]);
    expect(MADHHABS.join(" ")).not.toMatch(/jafari|ja'fari/i);
    expect(() => parseMadhhab("jafari")).toThrow("INVALID_MADHHAB");
    expect(() => parseMadhhab("Ja'fari")).toThrow("INVALID_MADHHAB");
  });

  it("uses the displayed Ethnologue 2026 totals from the Wikipedia table", () => {
    const languages = listLanguages();
    expect(languages).toHaveLength(20);
    expect(languages.map((item) => item.iso6393)).toEqual([
      "eng", "cmn", "hin", "spa", "arb", "fra", "ben", "por", "ind", "urd",
      "rus", "deu", "jpn", "pcm", "arz", "mar", "vie", "tel", "swh", "hau",
    ]);
    expect(languages.map((item) => item.totalMillions)).toEqual([
      1493, 1183, 611, 561, 335, 334, 274, 269, 255, 246,
      210, 133, 126, 121, 118, 99, 97, 96, 95, 94,
    ]);
    expect(languages.find((item) => item.id === "en")).toMatchObject({ l1Millions: 372, l2Millions: 1121 });
    expect(languages.some((item) => item.englishName === "Turkish" || item.englishName === "Punjabi" || item.englishName === "Tamil")).toBe(false);
    expect(SPEAKER_RANKING.excludedNextRow.englishName).toBe("Turkish");
    expect(SPEAKER_RANKING.ethnologueEditionNote).toContain("403");
    expect(listLocales()).toHaveLength(21);
    expect(listLocales().map((item) => item.localeId)).toContain("zh-Hans");
    expect(listLocales().map((item) => item.localeId)).toContain("zh-Hant");
  });

  it("sets direction and a no-evidence message for every locale", () => {
    for (const locale of listLocales()) {
      const copy = getCopy(locale.localeId);
      expect(copy.noEvidence.length).toBeGreaterThan(20);
      expect(messageLocales()).toContain(locale.localeId);
      if (locale.localeId === "en") {
        expect(copy.noEvidence).toBe(NO_EVIDENCE_EN);
        expect(copy.nativeReview).toBe("author");
        expect(copy.canonicalEnglish).toBeNull();
      } else {
        expect(copy.nativeReview).toBe("pending");
        expect(copy.canonicalEnglish).toBe(NO_EVIDENCE_EN);
      }
      if (locale.localeId === "ar" || locale.localeId === "ur" || locale.localeId === "ar-EG") {
        expect(locale.direction).toBe("rtl");
      }
      if (["en", "es", "fr"].includes(locale.localeId)) expect(locale.direction).toBe("ltr");
    }
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
