import { optionalStringEnum } from "openclaw/plugin-sdk/channel-actions";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { readBooleanParam } from "openclaw/plugin-sdk/boolean-param";
import {
  jsonResult,
  readNumberParam,
  readStringParam,
} from "openclaw/plugin-sdk/provider-web-search";
import {
  readResponseText,
  withSelfHostedWebToolsEndpoint,
} from "openclaw/plugin-sdk/provider-web-fetch";
import { wrapWebContent } from "openclaw/plugin-sdk/security-runtime";
import {
  SsrFBlockedError,
  isBlockedHostnameOrIp,
  isPrivateIpAddress,
  resolvePinnedHostnameWithPolicy,
  type LookupFn,
} from "openclaw/plugin-sdk/ssrf-runtime";
import { Type } from "typebox";
import { resolveFlaresolverrEndpoint, resolveMaxResults, resolveTimeoutSeconds } from "./config.js";
import { parseEbaySearchListings, type EbayListing } from "./ebay-search-parser.js";

const FLARESOLVERR_PRIVATE_ERROR =
  "Flaresolverr endpoint must target a private or internal self-hosted address.";

const EBAY_SORT: Record<string, string> = {
  best_match: "12",
  newest: "10",
  price_asc: "15",
  price_desc: "16",
  ending_soonest: "1",
};

const EBAY_CONDITION: Record<string, string> = {
  new: "1000",
  used: "3000",
  open_box: "1500",
  refurbished: "2010|2020|2030",
};

const EbaySearchToolSchema = Type.Object(
  {
    query: Type.String({
      description:
        'Search terms exactly as you would type them on ebay.com. Quote substrings to force exact-phrase match, e.g. mac studio "512gb RAM".',
      minLength: 1,
    }),
    minPriceUsd: Type.Optional(
      Type.Number({ description: "Minimum price (USD) filter.", minimum: 0 }),
    ),
    maxPriceUsd: Type.Optional(
      Type.Number({ description: "Maximum price (USD) filter.", minimum: 0 }),
    ),
    condition: optionalStringEnum(
      ["new", "used", "open_box", "refurbished"] as const,
      { description: "Item condition filter." },
    ),
    sort: optionalStringEnum(
      ["best_match", "newest", "price_asc", "price_desc", "ending_soonest"] as const,
      { description: "Sort order. Default: newest." },
    ),
    buyItNowOnly: Type.Optional(
      Type.Boolean({ description: "Restrict to fixed-price Buy It Now listings." }),
    ),
    maxResults: Type.Optional(
      Type.Number({
        description: "Maximum listings to return. Default 20, hard cap 100.",
        minimum: 1,
        maximum: 100,
      }),
    ),
  },
  { additionalProperties: false },
);

function buildSearchUrl(input: {
  query: string;
  minPriceUsd?: number;
  maxPriceUsd?: number;
  condition?: string;
  sort?: string;
  buyItNowOnly?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("_nkw", input.query);
  params.set("_sop", EBAY_SORT[input.sort ?? "newest"] ?? EBAY_SORT.newest);
  if (typeof input.minPriceUsd === "number") params.set("_udlo", String(input.minPriceUsd));
  if (typeof input.maxPriceUsd === "number") params.set("_udhi", String(input.maxPriceUsd));
  if (input.condition && EBAY_CONDITION[input.condition]) {
    params.set("LH_ItemCondition", EBAY_CONDITION[input.condition]);
  }
  if (input.buyItNowOnly) params.set("LH_BIN", "1");
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

async function flaresolverrEndpointTargetsPrivateNetwork(
  url: URL,
  lookupFn?: LookupFn,
): Promise<boolean> {
  if (isBlockedHostnameOrIp(url.hostname)) return true;
  try {
    const pinned = await resolvePinnedHostnameWithPolicy(url.hostname, {
      lookupFn,
      policy: { allowPrivateNetwork: true },
    });
    return pinned.addresses.every((address) => isPrivateIpAddress(address));
  } catch {
    return false;
  }
}

async function validateFlaresolverrEndpoint(endpoint: string, lookupFn?: LookupFn): Promise<URL> {
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new Error("Flaresolverr endpoint must be a valid http:// or https:// URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Flaresolverr endpoint must use http:// or https://.");
  }
  const isPrivateTarget = await flaresolverrEndpointTargetsPrivateNetwork(url, lookupFn);
  if (!isPrivateTarget) {
    throw new Error(`${FLARESOLVERR_PRIVATE_ERROR} Host: ${url.hostname}`);
  }
  return url;
}

function buildV1Url(endpoint: URL): string {
  const u = new URL(endpoint.toString());
  u.username = "";
  u.password = "";
  u.search = "";
  u.hash = "";
  const pathname = u.pathname.replace(/\/+$/, "");
  u.pathname = pathname.endsWith("/v1") ? pathname : `${pathname}/v1`;
  return u.toString();
}

type FlaresolverrEnvelope = {
  status?: string;
  message?: string;
  solution?: { url?: string; status?: number; response?: string };
};

// Heuristic: a real eBay /sch response always contains either listing-card
// markup or the canonical "no matches" copy. Anything else is almost certainly
// a bot interstitial that FlareSolverr accepted as solved. We've seen this
// produce a sub-2s response with no listings; retrying once usually recovers.
function looksLikeRealSearchResultsPage(html: string): boolean {
  if (!html) return false;
  if (html.includes("s-card s-card--horizontal")) return true;
  if (/No\s+exact\s+matches\s+found/i.test(html)) return true;
  if (/0\s+results?\s+for/i.test(html)) return true;
  return false;
}

export type EbaySearchParams = {
  cfg?: OpenClawConfig;
  query: string;
  minPriceUsd?: number;
  maxPriceUsd?: number;
  condition?: string;
  sort?: string;
  buyItNowOnly?: boolean;
  maxResults?: number;
};

export type EbaySearchResult = {
  searchUrl: string;
  finalUrl: string;
  query: string;
  filters: {
    minPriceUsd?: number;
    maxPriceUsd?: number;
    condition?: string;
    sort: string;
    buyItNowOnly?: boolean;
  };
  count: number;
  tookMs: number;
  listings: EbayListing[];
};

export async function runEbaySearch(params: EbaySearchParams): Promise<EbaySearchResult> {
  const endpointRaw = resolveFlaresolverrEndpoint(params.cfg);
  const endpoint = await validateFlaresolverrEndpoint(endpointRaw);
  const timeoutSeconds = resolveTimeoutSeconds(params.cfg);
  const maxResults = resolveMaxResults(params.cfg, params.maxResults);
  const sort = params.sort ?? "newest";

  const searchUrl = buildSearchUrl({
    query: params.query,
    minPriceUsd: params.minPriceUsd,
    maxPriceUsd: params.maxPriceUsd,
    condition: params.condition,
    sort,
    buyItNowOnly: params.buyItNowOnly,
  });

  const requestUrl = buildV1Url(endpoint);
  const body = {
    cmd: "request.get",
    url: searchUrl,
    maxTimeout: timeoutSeconds * 1000,
  };

  async function fetchOnce(): Promise<FlaresolverrEnvelope> {
    return await withSelfHostedWebToolsEndpoint(
      {
        url: requestUrl,
        timeoutSeconds,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      },
      async ({ response }) => {
        if (!response.ok) {
          const text = await readResponseText(response, { maxBytes: 64_000 });
          const detail = wrapWebContent(
            (text.text || response.statusText).slice(0, 1_000),
            "web_fetch",
          );
          throw new Error(`Flaresolverr error (${response.status}): ${detail}`);
        }
        return (await response.json()) as FlaresolverrEnvelope;
      },
    );
  }

  const start = Date.now();
  let envelope = await fetchOnce();

  if (envelope.status !== "ok" || !envelope.solution) {
    const reason = typeof envelope.message === "string" ? envelope.message : "unknown failure";
    throw new Error(`Flaresolverr returned non-ok status: ${wrapWebContent(reason, "web_fetch")}`);
  }

  let html = typeof envelope.solution.response === "string" ? envelope.solution.response : "";

  if (!looksLikeRealSearchResultsPage(html)) {
    envelope = await fetchOnce();
    if (envelope.status !== "ok" || !envelope.solution) {
      const reason = typeof envelope.message === "string" ? envelope.message : "unknown failure";
      throw new Error(`Flaresolverr returned non-ok status: ${wrapWebContent(reason, "web_fetch")}`);
    }
    html = typeof envelope.solution.response === "string" ? envelope.solution.response : "";
    if (!looksLikeRealSearchResultsPage(html)) {
      throw new Error(
        "eBay returned a non-listing page (likely bot interstitial). FlareSolverr accepted it but no s-card markup or 'no matches' copy was present after one retry.",
      );
    }
  }

  const listings = html ? parseEbaySearchListings(html, maxResults) : [];

  return {
    searchUrl,
    finalUrl: typeof envelope.solution.url === "string" ? envelope.solution.url : searchUrl,
    query: params.query,
    filters: {
      minPriceUsd: params.minPriceUsd,
      maxPriceUsd: params.maxPriceUsd,
      condition: params.condition,
      sort,
      buyItNowOnly: params.buyItNowOnly,
    },
    count: listings.length,
    tookMs: Date.now() - start,
    listings,
  };
}

export function createEbaySearchTool(api: OpenClawPluginApi) {
  return {
    name: "ebay_search",
    label: "eBay Search",
    description:
      "Search ebay.com for listings matching a query, with optional price/condition/sort filters. Returns structured listings (title, price, condition, URL). Bypasses Cloudflare via flaresolverr. Read-only; never places bids or purchases.",
    parameters: EbaySearchToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const query = readStringParam(rawParams, "query", { required: true });
      const minPriceUsd = readNumberParam(rawParams, "minPriceUsd");
      const maxPriceUsd = readNumberParam(rawParams, "maxPriceUsd");
      const condition = readStringParam(rawParams, "condition") || undefined;
      const sort = readStringParam(rawParams, "sort") || undefined;
      const buyItNowOnly = readBooleanParam(rawParams, "buyItNowOnly");
      const maxResults = readNumberParam(rawParams, "maxResults", { integer: true });

      try {
        return jsonResult(
          await runEbaySearch({
            cfg: api.config,
            query,
            minPriceUsd,
            maxPriceUsd,
            condition,
            sort,
            buyItNowOnly,
            maxResults,
          }),
        );
      } catch (err) {
        if (err instanceof SsrFBlockedError) {
          return jsonResult({ error: err.message });
        }
        throw err;
      }
    },
  };
}

export const __testing = { buildSearchUrl, buildV1Url };
