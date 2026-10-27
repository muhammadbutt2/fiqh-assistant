import type { Institution } from "@/data/sources";
import type { Madhhab } from "@/server/madhhab";
import { checkPermittedPage } from "@/server/source-check";

export type WebsiteSkip = { id: string; domain: string; reason: string };
export type WebsiteHit = {
  id: string;
  domain: string;
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: string;
};

export type WebsiteSearchReport = {
  searched: { id: string; domain: string }[];
  skipped: WebsiteSkip[];
  hits: WebsiteHit[];
};

function relevantToMadhhab(institution: Institution, madhhab: Madhhab): boolean {
  if (institution.trustedPool.length > 0) return institution.trustedPool.includes(madhhab);
  if (institution.madhhabScope.length > 0) return institution.madhhabScope.includes(madhhab);
  return false;
}

/** Plan and, only when retrieval is explicitly allowed, attempt a compliant fetch. No institution currently has a search API. */
export async function searchApprovedWebsites(input: {
  institutions: Institution[];
  madhhab: Madhhab;
  /** Optional page URLs already known to belong to an approved domain. Never invented. */
  urls?: string[];
  fetchImpl?: typeof fetch;
}): Promise<WebsiteSearchReport> {
  const skipped: WebsiteSkip[] = [];
  const searched: { id: string; domain: string }[] = [];
  const hits: WebsiteHit[] = [];
  const fetchImpl = input.fetchImpl ?? fetch;

  for (const institution of input.institutions) {
    if (!institution.retrievalAllowed) {
      skipped.push({ id: institution.id, domain: institution.domain, reason: "retrievalAllowed is false. A homepage check is not a licence to retrieve fatwas." });
      continue;
    }
    if (!relevantToMadhhab(institution, input.madhhab)) {
      skipped.push({ id: institution.id, domain: institution.domain, reason: "The selected madhhab is not in this institution's trusted pool." });
      continue;
    }
    const urls = (input.urls ?? []).filter((url) => {
      try {
        const host = new URL(url).hostname;
        return host === institution.domain || host.endsWith(`.${institution.domain}`);
      } catch {
        return false;
      }
    });
    if (urls.length === 0) {
      skipped.push({ id: institution.id, domain: institution.domain, reason: "No compliant search interface or API is configured for this domain, so it was not fetched." });
      continue;
    }
    searched.push({ id: institution.id, domain: institution.domain });
    for (const url of urls) {
      const permitted = await checkPermittedPage(institution, url, fetchImpl);
      if (!permitted.ok) {
        skipped.push({ id: institution.id, domain: institution.domain, reason: `${permitted.code}: ${permitted.detail}` });
        continue;
      }
      const page = await fetchImpl(permitted.finalUrl, { redirect: "follow" });
      if (!page.ok) {
        skipped.push({ id: institution.id, domain: institution.domain, reason: `FETCH_FAILED: HTTP ${page.status}` });
        continue;
      }
      const html = await page.text();
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? institution.officialName;
      const excerpt = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
      hits.push({ id: institution.id, domain: institution.domain, url: permitted.finalUrl, title, excerpt, retrievedAt: new Date().toISOString() });
    }
  }
  return { searched, skipped, hits };
}
