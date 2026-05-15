import { describe, expect, it } from "vitest";
import { runEbaySearch } from "./ebay-search-tool.js";

const live = process.env.EBAY_WATCH_LIVE === "1";

describe.skipIf(!live)("runEbaySearch (live)", () => {
  it("returns real listings for the standing mac-studio query", async () => {
    process.env.FLARESOLVERR_ENDPOINT ??= "http://192.168.1.246:8191";

    const result = await runEbaySearch({
      query: 'mac studio "512gb RAM"',
      sort: "newest",
      maxResults: 10,
    });

    expect(result.count).toBeGreaterThan(0);
    expect(result.searchUrl).toMatch(/_nkw=mac\+studio/);
    for (const l of result.listings) {
      expect(l.url).toMatch(/^https:\/\/www\.ebay\.com\/itm\/\d+$/);
      expect(l.title).toBeTruthy();
      expect(typeof l.priceUsd === "number" || l.priceUsd === null).toBe(true);
    }
  }, 90_000);

  it("respects maxPriceUsd filter in the search URL", async () => {
    process.env.FLARESOLVERR_ENDPOINT ??= "http://192.168.1.246:8191";

    const result = await runEbaySearch({
      query: 'mac studio "512gb RAM"',
      maxPriceUsd: 500,
      maxResults: 5,
    });

    expect(result.searchUrl).toContain("_udhi=500");
    for (const l of result.listings) {
      if (typeof l.priceUsd === "number") {
        expect(l.priceUsd).toBeLessThanOrEqual(500);
      }
    }
  }, 90_000);
});
