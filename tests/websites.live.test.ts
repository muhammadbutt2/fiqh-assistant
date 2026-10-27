import { describe, expect, it } from "vitest";
import { INSTITUTIONS, normalizeInstitution } from "@/data/sources";
import { inspectUrl } from "@/server/source-check";
import { searchApprovedWebsites } from "@/server/websites";

const live = process.env.LIVE_WEBSITE_TEST === "1";

describe.skipIf(!live)("live muftiwp.gov.my retrieval", () => {
  it("retrieves a real article page through the official OpenSearch RSS feed", async () => {
    const seed = INSTITUTIONS.find((item) => item.id === "mufti-wilayah-persekutuan");
    expect(seed).toBeTruthy();
    const institution = normalizeInstitution({ ...seed!, retrievalAllowed: true, trustedPool: ["shafii"] });
    const report = await searchApprovedWebsites({
      institutions: [institution],
      madhhab: "shafii",
      query: "Is wudu required before prayer?",
      queries: ["wudu", "wuduk", "ablution"],
      limit: 2,
      fetchPages: true,
      delayMs: 400,
      timeoutMs: 20000,
    });
    expect(report.searched[0]?.method).toBe("opensearch_rss");
    const pages = report.hits.filter((hit) => !hit.snippetOnly);
    expect(pages.length).toBeGreaterThan(0);
    const page = pages[0]!;
    expect(page.url).toMatch(/^https:\/\/www\.muftiwp\.gov\.my\/(en|ms)\/artikel\//);
    expect(page.excerpt.length).toBeGreaterThan(80);
    expect(inspectUrl(institution, page.url).ok).toBe(true);
    expect(inspectUrl(institution, "https://evil.example/fatwa").ok).toBe(false);
  }, 45000);
});
