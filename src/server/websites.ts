import { normalizeInstitution, type Institution } from "@/data/sources";
import type { Madhhab } from "@/server/madhhab";
import { scorePassageRelevance } from "@/server/retrieve";
import { checkPermittedPage, hostAllowed, inspectUrl, templateHostAllowed, WEBSITE_USER_AGENT } from "@/server/source-check";
import type { StoredChunk } from "@/server/types";
import { normalizeForSearch } from "@/server/normalize";
import { processQuestion } from "@/server/query";

export type WebsiteSkip = { id: string; domain: string; reason: string };
export type WebsiteHit = {
  id: string;
  domain: string;
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: string;
  language: string;
  institutionName: string;
  madhhab: Madhhab;
  snippetOnly: boolean;
  sourceApprovalStatus: "enabled" | "trial";
  provenance: "opensearch_rss_page" | "page_url";
  publishedAt: string | null;
};

export type WebsiteSearchReport = {
  searched: { id: string; domain: string; method: string }[];
  skipped: WebsiteSkip[];
  hits: WebsiteHit[];
  queries: string[];
  rejectedIrrelevant: { url: string; title: string; reason: string }[];
};

export type RetrievalTestRecord = NonNullable<Institution["lastRetrievalTest"]>;

export function institutionCoversMadhhab(institution: Institution, madhhab: Madhhab): boolean {
  if ((institution.trustedPool ?? []).length > 0) return institution.trustedPool.includes(madhhab);
  if ((institution.madhhabScope ?? []).length > 0) return institution.madhhabScope.includes(madhhab);
  return false;
}

function madhhabSkipReason(institution: Institution, madhhab: Madhhab): string {
  if ((institution.trustedPool ?? []).length > 0) {
    return `The selected madhhab (${madhhab}) is not in this institution's trusted pool (${institution.trustedPool.join(", ")}).`;
  }
  if ((institution.madhhabScope ?? []).length > 0) {
    return `The selected madhhab (${madhhab}) is outside this institution's recorded scope (${institution.madhhabScope.join(", ")}).`;
  }
  return "This institution has no trusted pool and no recorded madhhab scope, so it is not searched.";
}

export function extractArticleText(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const article = html.match(/itemprop=["']articleBody["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    ?? html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? html;
  const text = article
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return { title, text };
}

export function parseRssItems(xml: string): { title: string; url: string; description: string }[] {
  const items: { title: string; url: string; description: string }[] = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = decodeXml(block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const linkHref = block.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1];
    const url = decodeXml(linkHref ?? block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ?? "");
    const description = decodeXml((block.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i)?.[1] ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
    if (url) items.push({ title, url, description: description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
  }
  return items;
}

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
}

const WEBSITE_STOP = new Set(["this", "that", "with", "from", "have", "does", "required", "before", "after", "about", "into", "your", "what", "when", "which", "while", "would", "could", "should", "must", "ritual"]);

export function buildWebsiteQueries(input: { query?: string; queries?: string[] }): string[] {
  const raw = [...(input.queries ?? []), input.query ?? ""].map((item) => item.trim()).filter(Boolean);
  const tokens: string[] = [];
  for (const item of raw) {
    for (const token of item.split(/[^\p{L}\p{N}]+/u)) {
      const trimmed = token.trim();
      if (trimmed.length < 4) continue;
      if (WEBSITE_STOP.has(trimmed.toLowerCase())) continue;
      tokens.push(trimmed);
    }
  }
  const unique: string[] = [];
  for (const item of [...tokens, ...raw]) {
    const key = item.toLowerCase();
    if (unique.some((existing) => existing.toLowerCase() === key)) continue;
    unique.push(item.slice(0, 180));
    if (unique.length >= 6) break;
  }
  return unique;
}

export function detectPageLanguage(text: string): string {
  if (/[\u0600-\u06FF]{12,}/.test(text)) return "ar";
  const malay = (text.match(/\b(yang|untuk|adalah|dengan|ini|tidak|pada|oleh|sebagai|fatwa)\b/gi) ?? []).length;
  const english = (text.match(/\b(the|and|for|with|this|that|from|prayer|ablution)\b/gi) ?? []).length;
  if (malay >= 4 && malay > english) return "ms";
  return "en";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchApprovedWebsites(input: {
  institutions: Institution[];
  madhhab: Madhhab;
  query?: string;
  queries?: string[];
  urls?: string[];
  fetchImpl?: typeof fetch;
  limit?: number;
  fetchPages?: boolean;
  delayMs?: number;
  timeoutMs?: number;
}): Promise<WebsiteSearchReport> {
  const skipped: WebsiteSkip[] = [];
  const searched: { id: string; domain: string; method: string }[] = [];
  const hits: WebsiteHit[] = [];
  const rejectedIrrelevant: { url: string; title: string; reason: string }[] = [];
  const fetchImpl = input.fetchImpl ?? fetch;
  const limit = input.limit ?? 3;
  const fetchPages = input.fetchPages !== false;
  const delayMs = input.delayMs ?? 0;
  const timeoutMs = input.timeoutMs ?? 15000;
  const queries = buildWebsiteQueries(input);
  const seenUrls = new Set<string>();
  const relevanceQuestion = input.query ?? queries.join(" ");

  for (const raw of input.institutions) {
    const institution = normalizeInstitution(raw);
    if (!institution.retrievalAllowed) {
      skipped.push({ id: institution.id, domain: institution.domain, reason: "retrievalAllowed is false. A homepage check is not a licence to retrieve fatwas." });
      continue;
    }
    if (institution.reviewStatus === "excluded") {
      skipped.push({ id: institution.id, domain: institution.domain, reason: "reviewStatus is excluded." });
      continue;
    }
    if (!institutionCoversMadhhab(institution, input.madhhab)) {
      skipped.push({ id: institution.id, domain: institution.domain, reason: madhhabSkipReason(institution, input.madhhab) });
      continue;
    }

    const method = institution.retrievalMethod ?? "none";
    const template = institution.searchTemplate;
    if (method === "opensearch_rss" && template && queries.length > 0) {
      if (!templateHostAllowed(template, institution.domain)) {
        skipped.push({ id: institution.id, domain: institution.domain, reason: "The configured search template is not on this institution's recorded domain." });
        continue;
      }
      searched.push({ id: institution.id, domain: institution.domain, method });
      let retrievedHere = 0;
      for (const query of queries) {
        if (retrievedHere >= limit) break;
        const feedUrl = template.replace("{searchTerms}", encodeURIComponent(query));
        try {
          const feed = await fetchImpl(feedUrl, { headers: { "User-Agent": WEBSITE_USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
          if (!feed.ok) {
            skipped.push({ id: institution.id, domain: institution.domain, reason: `SEARCH_FAILED: HTTP ${feed.status}` });
            continue;
          }
          const items = parseRssItems(await feed.text());
          for (const item of items) {
            if (retrievedHere >= limit) break;
            const shape = inspectUrl(institution, item.url);
            if (!shape.ok) {
              skipped.push({ id: institution.id, domain: institution.domain, reason: `${shape.code}: ${item.url}` });
              continue;
            }
            const canonical = shape.parsed.toString();
            if (seenUrls.has(canonical)) continue;
            const preview = scorePassageRelevance(relevanceQuestion, item.title, { requirePrimaryTopic: true });
            if (!preview.relevant) {
              seenUrls.add(canonical);
              rejectedIrrelevant.push({ url: canonical, title: item.title, reason: preview.reason });
              continue;
            }
            seenUrls.add(canonical);
            if (delayMs > 0 && hits.length > 0) await sleep(delayMs);
            const hit = await retrieveApprovedPage({
              institution,
              madhhab: input.madhhab,
              url: canonical,
              fallbackTitle: item.title,
              fallbackExcerpt: item.description,
              fetchImpl,
              fetchPages,
              timeoutMs,
              provenance: "opensearch_rss_page",
            });
            if (!hit.ok) skipped.push({ id: institution.id, domain: institution.domain, reason: hit.reason });
            else {
              const body = scorePassageRelevance(relevanceQuestion, `${hit.hit.title} ${hit.hit.excerpt}`, { requirePrimaryTopic: true });
              if (!body.relevant) {
                rejectedIrrelevant.push({ url: hit.hit.url, title: hit.hit.title, reason: body.reason });
                continue;
              }
              hits.push(hit.hit);
              retrievedHere += 1;
            }
          }
        } catch (error) {
          skipped.push({ id: institution.id, domain: institution.domain, reason: `SEARCH_FAILED: ${error instanceof Error ? error.message : "network error"}` });
        }
      }
      if (retrievedHere === 0) {
        skipped.push({
          id: institution.id,
          domain: institution.domain,
          reason: rejectedIrrelevant.length > 0
            ? "The website was searched. Retrieved articles were not relevant to the question."
            : "OpenSearch returned no permitted article pages for the generated queries.",
        });
      }
      continue;
    }

    const urls = (input.urls ?? []).filter((url) => {
      try {
        const parsed = new URL(url);
        return hostAllowed(parsed.hostname, institution.domain);
      } catch {
        return false;
      }
    });
    if (method === "none" || (!template && urls.length === 0)) {
      skipped.push({ id: institution.id, domain: institution.domain, reason: "No compliant search interface or API is configured for this domain, so it was not fetched." });
      continue;
    }
    if (urls.length === 0) {
      skipped.push({ id: institution.id, domain: institution.domain, reason: "No compliant search interface or API is configured for this domain, so it was not fetched." });
      continue;
    }
    searched.push({ id: institution.id, domain: institution.domain, method: "page_url" });
    for (const url of urls.slice(0, limit)) {
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      if (delayMs > 0 && hits.length > 0) await sleep(delayMs);
      const hit = await retrieveApprovedPage({
        institution,
        madhhab: input.madhhab,
        url,
        fallbackTitle: "",
        fallbackExcerpt: "",
        fetchImpl,
        fetchPages,
        timeoutMs,
        provenance: "page_url",
      });
      if (!hit.ok) skipped.push({ id: institution.id, domain: institution.domain, reason: hit.reason });
      else {
        const body = scorePassageRelevance(relevanceQuestion, `${hit.hit.title} ${hit.hit.excerpt}`, { requirePrimaryTopic: true });
        if (!body.relevant) {
          rejectedIrrelevant.push({ url: hit.hit.url, title: hit.hit.title, reason: body.reason });
          continue;
        }
        hits.push(hit.hit);
      }
    }
  }
  return { searched, skipped, hits, queries, rejectedIrrelevant };
}

async function retrieveApprovedPage(input: {
  institution: Institution;
  madhhab: Madhhab;
  url: string;
  fallbackTitle: string;
  fallbackExcerpt: string;
  fetchImpl: typeof fetch;
  fetchPages: boolean;
  timeoutMs: number;
  provenance: WebsiteHit["provenance"];
}): Promise<{ ok: true; hit: WebsiteHit } | { ok: false; reason: string }> {
  const permitted = await checkPermittedPage(input.institution, input.url, input.fetchImpl);
  if (!permitted.ok) return { ok: false, reason: `${permitted.code}: ${permitted.detail}` };
  const retrievedAt = new Date().toISOString();
  let title = input.fallbackTitle;
  let excerpt = input.fallbackExcerpt.slice(0, 1200);
  let snippetOnly = true;
  if (input.fetchPages) {
    try {
      const page = await input.fetchImpl(permitted.finalUrl, { headers: { "User-Agent": WEBSITE_USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(input.timeoutMs) });
      if (!page.ok) return { ok: false, reason: `FETCH_FAILED: HTTP ${page.status}` };
      const extracted = extractArticleText(await page.text());
      if (extracted.text.length < 80) return { ok: false, reason: "PAGE_TEXT_TOO_SHORT" };
      title = extracted.title || title || input.institution.officialName;
      excerpt = extracted.text.slice(0, 1200);
      snippetOnly = false;
    } catch (error) {
      return { ok: false, reason: `FETCH_FAILED: ${error instanceof Error ? error.message : "network error"}` };
    }
  }
  return {
    ok: true,
    hit: {
      id: input.institution.id,
      domain: input.institution.domain,
      url: permitted.finalUrl,
      title: title || input.institution.officialName,
      excerpt,
      retrievedAt,
      language: detectPageLanguage(excerpt),
      institutionName: input.institution.officialName,
      madhhab: input.madhhab,
      snippetOnly,
      sourceApprovalStatus: input.institution.retrievalAllowed ? "enabled" : "trial",
      provenance: input.provenance,
      publishedAt: parsePublishedDate(title, excerpt),
    },
  };
}

function parsePublishedDate(title: string, excerpt: string): string | null {
  const match = `${title} ${excerpt}`.match(/\b(20\d{2}|19\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  return match?.[0] ?? null;
}

export function websiteHitsToChunks(hits: WebsiteHit[]): StoredChunk[] {
  return hits.filter((hit) => !hit.snippetOnly && hit.excerpt.trim().length > 0).map((hit, index) => ({
    id: `web_${hit.id}_${index}_${hit.url.length}`,
    documentId: `institution:${hit.id}`,
    workId: hit.id,
    editionId: null,
    madhhab: hit.madhhab,
    comparativeAppliesTo: [],
    opinionLabels: [{ madhhab: hit.madhhab, label: "Institutional fatwa; not a quotation from a classical book." }],
    sourceClass: "institutional_fatwa",
    language: hit.language,
    volume: null,
    printedPageStart: null,
    printedPageEnd: null,
    pdfPageStart: 1,
    pdfPageEnd: 1,
    chapterPath: [hit.title],
    originalText: hit.excerpt,
    normalizedText: normalizeForSearch(hit.excerpt),
    translation: null,
    ocrQuality: "not_needed",
    rightsStatus: "unknown",
    verificationStatus: "verified",
    trustClassification: "approved",
    searchable: false,
    url: hit.url,
    fatwaNumber: null,
    title: hit.title,
    author: hit.institutionName,
    editionLabel: null,
    isTestFixture: false,
    embedding: null,
  }));
}

export function retrievalTestRecord(report: WebsiteSearchReport, method: string): RetrievalTestRecord {
  const pages = report.hits.filter((hit) => !hit.snippetOnly);
  return {
    at: new Date().toISOString(),
    ok: pages.length > 0,
    method,
    sampleUrl: pages[0]?.url ?? null,
    error: pages.length > 0 ? null : report.skipped.map((item) => item.reason).join("; ") || "No full pages retrieved.",
  };
}

export async function trialSearchInstitution(input: {
  institution: Institution;
  madhhab: Madhhab;
  question: string;
  fetchImpl?: typeof fetch;
  limit?: number;
}): Promise<WebsiteSearchReport> {
  const processed = processQuestion(input.question);
  const trial = normalizeInstitution({
    ...input.institution,
    retrievalAllowed: true,
    trustedPool: input.institution.trustedPool.length > 0 ? input.institution.trustedPool : [input.madhhab],
  });
  const glossaryEn = processed.variants.find((item) => item.id === "glossary-en")?.text ?? "";
  const needle = input.question.toLowerCase();
  const rankedConcepts = processed.concepts
    .filter((item) => item.category !== "question_intent")
    .sort((a, b) => Number(needle.includes(b.id)) - Number(needle.includes(a.id)));
  const report = await searchApprovedWebsites({
    institutions: [trial],
    madhhab: input.madhhab,
    queries: [
      ...rankedConcepts.map((item) => item.id.replace(/_/g, " ")),
      glossaryEn,
      input.question,
      processed.arabicQuery.text ?? "",
      processed.urduQuery.text ?? "",
    ].filter(Boolean),
    limit: input.limit ?? 3,
    fetchPages: true,
    fetchImpl: input.fetchImpl,
    delayMs: input.fetchImpl ? 0 : 350,
  });
  if (!input.institution.retrievalAllowed) {
    report.hits = report.hits.map((hit) => ({ ...hit, sourceApprovalStatus: "trial" as const }));
  }
  return report;
}
