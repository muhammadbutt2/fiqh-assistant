import type { Institution } from "@/data/sources";

export async function checkPermittedPage(institution: Institution, url: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: false; code: string; detail: string } | { ok: true; status: number; finalUrl: string }> {
  if (!institution.retrievalAllowed) {
    return { ok: false, code: "RETRIEVAL_NOT_PERMITTED", detail: "This institution is not approved for retrieval. A homepage check is not a licence to store its fatwas." };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, code: "INVALID_URL", detail: "The URL could not be parsed." };
  }
  if (parsed.hostname !== institution.domain && !parsed.hostname.endsWith(`.${institution.domain}`)) {
    return { ok: false, code: "HOST_NOT_ALLOWED", detail: "The URL host is not the institution's recorded domain." };
  }
  const robotsUrl = `${parsed.origin}/robots.txt`;
  const robots = await fetchImpl(robotsUrl, { redirect: "manual" });
  if (robots.ok) {
    const body = await robots.text();
    if (/disallow:\s*\/\s*$/im.test(body)) {
      return { ok: false, code: "ROBOTS_DISALLOW", detail: "robots.txt disallows the site root for the generic user agent." };
    }
  }
  const page = await fetchImpl(parsed.toString(), { redirect: "follow" });
  if (!page.ok) return { ok: false, code: "FETCH_FAILED", detail: `HTTP ${page.status}` };
  return { ok: true, status: page.status, finalUrl: page.url };
}
