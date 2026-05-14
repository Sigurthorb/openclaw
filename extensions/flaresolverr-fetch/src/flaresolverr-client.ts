import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import {
  readResponseText,
  truncateText,
  withSelfHostedWebToolsEndpoint,
} from "openclaw/plugin-sdk/provider-web-fetch";
import { wrapExternalContent, wrapWebContent } from "openclaw/plugin-sdk/security-runtime";
import {
  SsrFBlockedError,
  isBlockedHostnameOrIp,
  isPrivateIpAddress,
  resolvePinnedHostnameWithPolicy,
  type LookupFn,
} from "openclaw/plugin-sdk/ssrf-runtime";
import {
  resolveFlaresolverrEndpoint,
  resolveFlaresolverrMaxChars,
  resolveFlaresolverrTimeoutSeconds,
} from "./config.js";

export type FlaresolverrFetchParams = {
  cfg?: OpenClawConfig;
  url: string;
  extractMode: "html" | "text";
  maxChars?: number;
  timeoutSeconds?: number;
};

const FLARESOLVERR_PRIVATE_ERROR =
  "Flaresolverr endpoint must target a private or internal self-hosted address.";

export function assertFlaresolverrTargetAllowed(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrFBlockedError("Invalid URL supplied to flaresolverr_fetch");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrFBlockedError(
      `Blocked non-HTTP(S) protocol in flaresolverr_fetch URL: ${parsed.protocol}`,
    );
  }
  if (isBlockedHostnameOrIp(parsed.hostname)) {
    throw new SsrFBlockedError(
      `Blocked hostname or private/internal IP in flaresolverr_fetch URL: ${parsed.hostname}`,
    );
  }
}

async function flaresolverrEndpointTargetsPrivateNetwork(
  url: URL,
  lookupFn?: LookupFn,
): Promise<boolean> {
  if (isBlockedHostnameOrIp(url.hostname)) {
    return true;
  }
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

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type FlaresolverrSolution = {
  url?: string;
  status?: number;
  response?: string;
  userAgent?: string;
  cookies?: unknown;
};

type FlaresolverrEnvelope = {
  status?: string;
  message?: string;
  solution?: FlaresolverrSolution;
};

export async function runFlaresolverrFetch(
  params: FlaresolverrFetchParams,
): Promise<Record<string, unknown>> {
  assertFlaresolverrTargetAllowed(params.url);

  const endpointRaw = resolveFlaresolverrEndpoint(params.cfg);
  const endpoint = await validateFlaresolverrEndpoint(endpointRaw);
  const timeoutSeconds = resolveFlaresolverrTimeoutSeconds(params.cfg, params.timeoutSeconds);
  const maxChars = resolveFlaresolverrMaxChars(params.cfg, params.maxChars);

  const requestUrl = buildV1Url(endpoint);
  const body = {
    cmd: "request.get",
    url: params.url,
    maxTimeout: timeoutSeconds * 1000,
  };

  const start = Date.now();
  const envelope = await withSelfHostedWebToolsEndpoint(
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
        const detail = wrapWebContent((text.text || response.statusText).slice(0, 1_000), "web_fetch");
        throw new Error(`Flaresolverr error (${response.status}): ${detail}`);
      }
      return (await response.json()) as FlaresolverrEnvelope;
    },
  );

  if (envelope.status !== "ok" || !envelope.solution) {
    const reason = typeof envelope.message === "string" ? envelope.message : "unknown failure";
    throw new Error(`Flaresolverr returned non-ok status: ${wrapWebContent(reason, "web_fetch")}`);
  }

  const solution = envelope.solution;
  const html = typeof solution.response === "string" ? solution.response : "";
  if (!html) {
    throw new Error("Flaresolverr returned an empty response body.");
  }

  const rawText = params.extractMode === "text" ? stripHtmlToText(html) : html;
  const truncated = truncateText(rawText, maxChars);

  return {
    url: params.url,
    finalUrl: typeof solution.url === "string" ? solution.url : params.url,
    status: typeof solution.status === "number" ? solution.status : undefined,
    extractor: "flaresolverr",
    extractMode: params.extractMode,
    userAgent: typeof solution.userAgent === "string" ? solution.userAgent : undefined,
    tookMs: Date.now() - start,
    externalContent: {
      untrusted: true,
      source: "web_fetch",
      wrapped: true,
    },
    truncated: truncated.truncated,
    rawLength: rawText.length,
    text: wrapExternalContent(truncated.text, {
      source: "web_fetch",
      includeWarning: false,
    }),
  };
}

export const __testing = {
  assertFlaresolverrTargetAllowed,
  buildV1Url,
  stripHtmlToText,
  validateFlaresolverrEndpoint,
};
