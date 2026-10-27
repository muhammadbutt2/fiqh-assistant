import { normalizeInstitution, type Institution } from "@/data/sources";

export const WEBSITE_USER_AGENT = "FiqhAssistant/0.1 (approved-source retrieval; local research tool)";

export function hostAllowed(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  const root = domain.toLowerCase();
  return host === root || host.endsWith(`.${root}`);
}

export function pathAllowed(pathname: string, allowlist: string[] | undefined): boolean {
  if (!allowlist || allowlist.length === 0) return true;
  return allowlist.some((prefix) => pathname.startsWith(prefix));
}

export function inspectUrl(institution: Institution, url: string): { ok: true; parsed: URL } | { ok: false; code: string; detail: string } {
  const record = normalizeInstitution(institution);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, code: "INVALID_URL", detail: "The URL could not be parsed." };
  }
  if (!hostAllowed(parsed.hostname, record.domain)) {
    return { ok: false, code: "HOST_NOT_ALLOWED", detail: "The URL host is not the institution's recorded domain." };
  }
  if (!pathAllowed(parsed.pathname, record.pathAllowlist)) {
    return { ok: false, code: "PATH_NOT_ALLOWED", detail: "The URL path is outside this institution's permitted path list." };
  }
  return { ok: true, parsed };
}

export function templateHostAllowed(template: string, domain: string): boolean {
  try {
    return hostAllowed(new URL(template.replace("{searchTerms}", "test")).hostname, domain);
  } catch {
    return false;
  }
}

export async function checkPermittedPage(institution: Institution, url: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: false; code: string; detail: string } | { ok: true; status: number; finalUrl: string }> {
  const record = normalizeInstitution(institution);
  if (!record.retrievalAllowed) {
    return { ok: false, code: "RETRIEVAL_NOT_PERMITTED", detail: "This institution is not approved for retrieval. A homepage check is not a licence to store its fatwas." };
  }
  const shape = inspectUrl(record, url);
  if (!shape.ok) return shape;
  const robotsUrl = `${shape.parsed.origin}/robots.txt`;
  const robots = await fetchImpl(robotsUrl, { headers: { "User-Agent": WEBSITE_USER_AGENT }, redirect: "manual" });
  if (robots.ok) {
    const body = await robots.text();
    if (/disallow:\s*\/\s*$/im.test(body)) {
      return { ok: false, code: "ROBOTS_DISALLOW", detail: "robots.txt disallows the site root for the generic user agent." };
    }
  }
  return { ok: true, status: robots.ok ? robots.status : 0, finalUrl: shape.parsed.toString() };
}
