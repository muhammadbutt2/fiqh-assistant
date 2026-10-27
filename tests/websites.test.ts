import { afterEach, describe, expect, it, vi } from "vitest";
import { INSTITUTIONS, normalizeInstitution } from "@/data/sources";
import { answerQuestion } from "@/server/answer";
import { postInstitutionReview, postWebsiteTest } from "@/server/handlers";
import { researchQuestion } from "@/server/research";
import { checkPermittedPage, inspectUrl, pathAllowed } from "@/server/source-check";
import { signSession } from "@/server/security";
import { createMemoryStore } from "@/server/store";
import { unavailableChat } from "@/server/ai";
import { buildWebsiteQueries, parseRssItems, searchApprovedWebsites, trialSearchInstitution, websiteHitsToChunks } from "@/server/websites";
import { fixture } from "./fixtures";

const foundMuftiwp = INSTITUTIONS.find((item) => item.id === "mufti-wilayah-persekutuan");
if (!foundMuftiwp) throw new Error("muftiwp seed missing");
const MUFTIWP = foundMuftiwp;

const ARTICLE_BODY = "This official article explains wudu and prayer for the Federal Territories. The Mufti ordinarily follows the accepted Shafi'i view under Act 505. ".repeat(3);
const ARTICLE_HTML = `<html><head><title>Irsyad Hukum: Wudu before prayer</title></head><body><div itemprop="articleBody">${ARTICLE_BODY}</div></body></html>`;
const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title><![CDATA[Wudu before prayer]]></title><link>https://www.muftiwp.gov.my/en/artikel/irsyad-hukum/umum/100-wudu</link><description>short snippet</description></item>
<item><title>Off domain</title><link>https://evil.example/fatwa</link><description>bad</description></item>
<item><title>Wrong path</title><link>https://www.muftiwp.gov.my/en/carian?q=wudu</link><description>search page</description></item>
</channel></rss>`;

function enabledMuftiwp() {
  return normalizeInstitution({ ...MUFTIWP, retrievalAllowed: true, trustedPool: ["shafii"] });
}

function mockFetch(overrides?: { feedStatus?: number; pageStatus?: number; feed?: string; page?: string }): typeof fetch {
  return (async (url) => {
    const href = String(url);
    if (href.includes("robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 404 });
    if (href.includes("format=feed") || href.includes("/carian?")) {
      return new Response(overrides?.feed ?? RSS, { status: overrides?.feedStatus ?? 200 });
    }
    if (href.includes("/en/artikel/") || href.includes("/ms/artikel/")) {
      return new Response(overrides?.page ?? ARTICLE_HTML, { status: overrides?.pageStatus ?? 200 });
    }
    return new Response("not fetched", { status: 404 });
  }) as typeof fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("approved website retrieval", () => {
  it("does not fetch any candidate institution while retrievalAllowed is false", async () => {
    let called = 0;
    const report = await searchApprovedWebsites({
      institutions: INSTITUTIONS,
      madhhab: "hanafi",
      urls: ["https://darululoomkarachi.edu.pk/fatwa"],
      fetchImpl: async () => {
        called += 1;
        return new Response("no", { status: 200 });
      },
    });
    expect(called).toBe(0);
    expect(report.searched).toEqual([]);
    expect(report.hits).toEqual([]);
    expect(report.skipped.length).toBe(INSTITUTIONS.length);
    expect(report.skipped.every((item) => item.reason.includes("retrievalAllowed"))).toBe(true);
  });

  it("refuses a URL whose host is not the approved domain even when retrieval is allowed", async () => {
    const institution = { ...INSTITUTIONS[0], retrievalAllowed: true, trustedPool: ["hanafi" as const] };
    const result = await checkPermittedPage(institution, "https://evil.example/fatwa", async () => new Response("no"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("HOST_NOT_ALLOWED");
  });

  it("does not invent a search when retrieval is allowed but no URL or API is configured", async () => {
    const institution = { ...INSTITUTIONS[0], retrievalAllowed: true, trustedPool: ["hanafi" as const] };
    let called = 0;
    const report = await searchApprovedWebsites({
      institutions: [institution],
      madhhab: "hanafi",
      fetchImpl: async () => {
        called += 1;
        return new Response("no");
      },
    });
    expect(called).toBe(0);
    expect(report.searched).toEqual([]);
    expect(report.skipped[0]?.reason).toMatch(/No compliant search interface/);
  });

  it("rejects a same-host URL outside the path allowlist", () => {
    const result = inspectUrl(enabledMuftiwp(), "https://www.muftiwp.gov.my/en/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PATH_NOT_ALLOWED");
    expect(pathAllowed("/en/artikel/irsyad-hukum/umum/1", ["/en/artikel/", "/ms/artikel/"])).toBe(true);
  });

  it("parses RSS items including CDATA titles", () => {
    const items = parseRssItems(RSS);
    expect(items[0]?.title).toBe("Wudu before prayer");
    expect(items[0]?.url).toBe("https://www.muftiwp.gov.my/en/artikel/irsyad-hukum/umum/100-wudu");
    expect(items).toHaveLength(3);
  });

  it("turns an English question into short website search terms including wudu", async () => {
    const terms = buildWebsiteQueries({ queries: ["Is wudu required before prayer?", "وضوء", "وضو"] });
    expect(terms.some((item) => item.toLowerCase() === "wudu")).toBe(true);
    const report = await trialSearchInstitution({
      institution: MUFTIWP,
      madhhab: "shafii",
      question: "Is wudu required before prayer?",
      fetchImpl: mockFetch(),
    });
    expect(report.queries[0]?.toLowerCase()).toBe("wudu");
    expect(report.hits[0]?.snippetOnly).toBe(false);
  });

  it("retrieves full article pages from a mocked OpenSearch feed and drops off-domain and off-path items", async () => {
    const report = await searchApprovedWebsites({
      institutions: [enabledMuftiwp()],
      madhhab: "shafii",
      query: "wudu prayer",
      fetchImpl: mockFetch(),
      limit: 3,
    });
    expect(report.searched).toEqual([{ id: "mufti-wilayah-persekutuan", domain: "muftiwp.gov.my", method: "opensearch_rss" }]);
    expect(report.hits).toHaveLength(1);
    expect(report.hits[0]?.snippetOnly).toBe(false);
    expect(report.hits[0]?.url).toContain("/en/artikel/");
    expect(report.hits[0]?.excerpt).toMatch(/Act 505/);
    expect(report.hits[0]?.sourceApprovalStatus).toBe("enabled");
    expect(report.skipped.some((item) => item.reason.startsWith("HOST_NOT_ALLOWED"))).toBe(true);
    expect(report.skipped.some((item) => item.reason.startsWith("PATH_NOT_ALLOWED"))).toBe(true);
    const chunks = websiteHitsToChunks(report.hits);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.sourceClass).toBe("institutional_fatwa");
    expect(chunks[0]?.searchable).toBe(false);
    expect(chunks[0]?.url).toBe(report.hits[0]?.url);
  });

  it("skips muftiwp for a Hanafi question even when retrieval is enabled", async () => {
    let called = 0;
    const report = await searchApprovedWebsites({
      institutions: [enabledMuftiwp()],
      madhhab: "hanafi",
      query: "wudu",
      fetchImpl: async () => {
        called += 1;
        return new Response("no");
      },
    });
    expect(called).toBe(0);
    expect(report.hits).toEqual([]);
    expect(report.skipped[0]?.reason).toMatch(/trusted pool/);
  });

  it("records SEARCH_FAILED when the approved website is unavailable", async () => {
    const report = await searchApprovedWebsites({
      institutions: [enabledMuftiwp()],
      madhhab: "shafii",
      query: "wudu",
      fetchImpl: mockFetch({ feedStatus: 503 }),
    });
    expect(report.hits).toEqual([]);
    expect(report.skipped.some((item) => item.reason.includes("SEARCH_FAILED"))).toBe(true);
  });

  it("does not treat a search snippet as evidence when page fetch is skipped", async () => {
    const report = await searchApprovedWebsites({
      institutions: [enabledMuftiwp()],
      madhhab: "shafii",
      query: "wudu",
      fetchImpl: mockFetch(),
      fetchPages: false,
    });
    expect(report.hits[0]?.snippetOnly).toBe(true);
    expect(websiteHitsToChunks(report.hits)).toEqual([]);
  });

  it("searches approved local books first and does not call websites when a book match exists", async () => {
    let called = 0;
    const chunk = fixture({ id: "book", madhhab: "shafii", originalText: "TEST FIXTURE الوضوء قبل الصلاة", isTestFixture: false });
    const result = await researchQuestion({
      chunks: [chunk],
      madhhab: "shafii",
      variants: [{ id: "v", kind: "original", language: "en", text: "wudu before prayer الوضوء", method: "original", model: null }],
      allowTestFixtures: false,
      institutions: [enabledMuftiwp()],
      fetchImpl: async () => {
        called += 1;
        return new Response("no");
      },
    });
    expect(called).toBe(0);
    expect(result.evidenceRole).toBe("approved");
    expect(result.summary.websiteHits).toBe(0);
    expect(result.websites.skipped[0]?.reason).toMatch(/Local approved book evidence was sufficient/);
  });

  it("uses institutional pages when local approved evidence is empty", async () => {
    const result = await researchQuestion({
      chunks: [],
      madhhab: "shafii",
      variants: [{ id: "v", kind: "original", language: "en", text: "wudu before prayer", method: "original", model: null }],
      allowTestFixtures: false,
      institutions: [enabledMuftiwp()],
      fetchImpl: mockFetch(),
    });
    expect(result.evidenceRole).toBe("institutional");
    expect(result.selected[0]?.url).toContain("muftiwp.gov.my");
    expect(result.selected[0]?.sourceClass).toBe("institutional_fatwa");
  });

  it("returns no evidence for a Hanafi question when only a Shafi'i website is enabled", async () => {
    const answer = await answerQuestion({
      madhhab: "hanafi",
      answerLocale: "en",
      question: "Is wudu required before prayer?",
      chunks: [],
      institutions: [enabledMuftiwp()],
      fetchImpl: mockFetch(),
      chat: unavailableChat(),
      libraryEmpty: true,
    });
    expect(answer.evidenceRole).toBe("none");
    expect(answer.answerStatus).toBe("insufficient_evidence");
    expect(answer.citations).toEqual([]);
  });

  it("shows institutional excerpts with a website link and does not issue a ruling", async () => {
    const answer = await answerQuestion({
      madhhab: "shafii",
      answerLocale: "en",
      question: "Is wudu required before prayer?",
      chunks: [],
      institutions: [enabledMuftiwp()],
      fetchImpl: mockFetch(),
      chat: unavailableChat(),
    });
    expect(answer.evidenceRole).toBe("institutional");
    expect(answer.answerStatus).toBe("human_review_required");
    expect(answer.citations[0]?.url).toContain("/en/artikel/");
    expect(answer.citations[0]?.originalExcerpt).toMatch(/Act 505/);
    expect(answer.citations[0]?.sourceType).toBe("institutional_fatwa");
    expect(answer.answer).toMatch(/not a quotation from a classical fiqh book/i);
  });
});

describe("admin website gates", () => {
  const secret = "secret";
  function deps() {
    return {
      store: createMemoryStore(),
      chat: unavailableChat(),
      translator: { id: "u", available: () => false, translate: async () => [] },
      authSecret: secret,
      adminPassword: "correct-horse",
      storageDir: ".data/storage",
      maxUploadBytes: 1000,
      rateLimit: () => true,
    };
  }
  function cookie() {
    return `fiqh_session=${encodeURIComponent(signSession({ sub: "admin", role: "admin", exp: Date.now() + 10000 }, secret))}`;
  }

  it("requires a dedicated test question before enabling retrieval", async () => {
    const response = await postInstitutionReview(new Request("http://local/api/admin/sources", {
      method: "POST",
      headers: { cookie: cookie() },
      body: JSON.stringify({
        id: "mufti-wilayah-persekutuan",
        trustedPool: ["shafii"],
        reviewerNote: "checked identity",
        methodology: "Act 505 Shafi'i starting point",
        checkedOn: "2026-10-27",
        retrievalAllowed: true,
      }),
    }), deps());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "TEST_QUESTION_REQUIRED" });
  });

  it("does not enable retrieval when the live test retrieves no page", async () => {
    vi.stubGlobal("fetch", mockFetch({ feedStatus: 503 }));
    const store = createMemoryStore();
    const response = await postInstitutionReview(new Request("http://local/api/admin/sources", {
      method: "POST",
      headers: { cookie: cookie() },
      body: JSON.stringify({
        id: "mufti-wilayah-persekutuan",
        trustedPool: ["shafii"],
        reviewerNote: "checked identity",
        methodology: "Act 505 Shafi'i starting point",
        checkedOn: "2026-10-27",
        testQuestion: "Is wudu required before prayer?",
        retrievalAllowed: true,
      }),
    }), { ...deps(), store });
    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toBe("RETRIEVAL_TEST_FAILED");
    const saved = (await store.listInstitutions()).find((item) => item.id === "mufti-wilayah-persekutuan");
    expect(saved?.retrievalAllowed).toBe(false);
  });

  it("enables only the tested institution after a successful mocked retrieval", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const store = createMemoryStore();
    const response = await postInstitutionReview(new Request("http://local/api/admin/sources", {
      method: "POST",
      headers: { cookie: cookie() },
      body: JSON.stringify({
        id: "mufti-wilayah-persekutuan",
        trustedPool: ["shafii"],
        reviewerNote: "Live OpenSearch test retrieved an article body. Query-time link only.",
        methodology: "Act 505: the Mufti ordinarily follows the accepted Shafi'i view.",
        checkedOn: "2026-10-27",
        testQuestion: "Is wudu required before prayer?",
        retrievalAllowed: true,
        termsReviewStatus: "reviewed_query_time_link",
      }),
    }), { ...deps(), store });
    expect(response.status).toBe(200);
    const listed = await store.listInstitutions();
    const enabled = listed.find((item) => item.id === "mufti-wilayah-persekutuan");
    expect(enabled?.retrievalAllowed).toBe(true);
    expect(enabled?.trustedPool).toEqual(["shafii"]);
    expect(enabled?.lastRetrievalTest?.ok).toBe(true);
    expect(listed.filter((item) => item.retrievalAllowed).map((item) => item.id)).toEqual(["mufti-wilayah-persekutuan"]);
  });

  it("runs the admin website test without enabling retrieval", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const store = createMemoryStore();
    const response = await postWebsiteTest(new Request("http://local/api/admin/websites", {
      method: "POST",
      headers: { cookie: cookie() },
      body: JSON.stringify({
        institutionId: "mufti-wilayah-persekutuan",
        question: "Is wudu required before prayer?",
        madhhab: "shafii",
      }),
    }), { ...deps(), store });
    expect(response.status).toBe(200);
    const body = await response.json() as { live: boolean; enabled: boolean; pagesRetrieved: number; offDomainRejected: boolean; arabicQuery: { text: string | null }; hits: { url: string }[] };
    expect(body.live).toBe(true);
    expect(body.enabled).toBe(false);
    expect(body.pagesRetrieved).toBeGreaterThan(0);
    expect(body.offDomainRejected).toBe(true);
    expect(body.hits[0]?.url).toContain("muftiwp.gov.my");
    const saved = (await store.listInstitutions()).find((item) => item.id === "mufti-wilayah-persekutuan");
    expect(saved?.retrievalAllowed).toBe(false);
    expect(saved?.lastRetrievalTest?.ok).toBe(true);
  });

  it("keeps every seed institution disabled", () => {
    expect(INSTITUTIONS.every((item) => item.retrievalAllowed === false)).toBe(true);
  });
});
