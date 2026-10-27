import { describe, expect, it } from "vitest";
import { INSTITUTIONS } from "@/data/sources";
import { checkPermittedPage } from "@/server/source-check";
import { searchApprovedWebsites } from "@/server/websites";

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
});
