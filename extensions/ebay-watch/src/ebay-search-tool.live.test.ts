import { describe, expect, it } from "vitest";
import { runEbaySearch } from "./ebay-search-tool.js";

const live = process.env.EBAY_WATCH_LIVE === "1";

// eBay /sch is behind Akamai Bot Manager, not Cloudflare. FlareSolverr does
// not defeat Akamai — it relies on Akamai's stale-session leniency. When the
// homelab egress IP trips Akamai's velocity guard, every request returns
// "Access Denied" from errors.edgesuite.net until the cooldown elapses
// (~30-60 min observed). When that happens the tool throws a specific error;
// we treat that as an environmental skip, not a test failure, so the suite
// reflects "plugin code OK, eBay is blocking us right now".
async function runOrSkipIfBlocked<T>(fn: () => Promise<T>): Promise<T | "AKAMAI_BLOCKED"> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/bot interstitial|Access Denied/i.test(msg)) return "AKAMAI_BLOCKED";
    throw err;
  }
}

describe.skipIf(!live)("runEbaySearch (live)", () => {
  it("returns real listings for the standing mac-studio query", async () => {
    process.env.FLARESOLVERR_ENDPOINT ??= "http://192.168.1.246:8191";

    const outcome = await runOrSkipIfBlocked(() =>
      runEbaySearch({
        query: 'mac studio "512gb RAM"',
        sort: "newest",
        maxResults: 10,
      }),
    );
    if (outcome === "AKAMAI_BLOCKED") {
      console.warn("[live] skipping: eBay/Akamai is blocking the homelab IP right now");
      return;
    }
    const result = outcome;

    // The tool now retries on suspected interstitials and throws if both
    // attempts fail. A successful run should always produce >0 listings for
    // this query — if it returns 0, eBay genuinely had no matches (rare for
    // this query) and we still want to fail loudly.
    expect(result.count).toBeGreaterThan(0);
    expect(result.searchUrl).toMatch(/_nkw=mac\+studio/);
    for (const l of result.listings) {
      expect(l.url).toMatch(/^https:\/\/www\.ebay\.com\/itm\/\d+$/);
      expect(l.title).toBeTruthy();
      expect(typeof l.priceUsd === "number" || l.priceUsd === null).toBe(true);
    }
  }, 120_000);

  it("respects maxPriceUsd filter in the search URL", async () => {
    process.env.FLARESOLVERR_ENDPOINT ??= "http://192.168.1.246:8191";

    const outcome = await runOrSkipIfBlocked(() =>
      runEbaySearch({
        query: 'mac studio "512gb RAM"',
        maxPriceUsd: 500,
        maxResults: 5,
      }),
    );
    if (outcome === "AKAMAI_BLOCKED") {
      console.warn("[live] skipping: eBay/Akamai is blocking the homelab IP right now");
      return;
    }
    const result = outcome;

    expect(result.searchUrl).toContain("_udhi=500");
    for (const l of result.listings) {
      if (typeof l.priceUsd === "number") {
        expect(l.priceUsd).toBeLessThanOrEqual(500);
      }
    }
  }, 120_000);
});
