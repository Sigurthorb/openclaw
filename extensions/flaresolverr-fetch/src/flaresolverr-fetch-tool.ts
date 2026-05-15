import { optionalStringEnum } from "openclaw/plugin-sdk/channel-actions";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import {
  jsonResult,
  readNumberParam,
  readStringParam,
} from "openclaw/plugin-sdk/provider-web-search";
import { Type } from "typebox";
import { runFlaresolverrFetch } from "./flaresolverr-client.js";

const FlaresolverrFetchToolSchema = Type.Object(
  {
    url: Type.String({
      description: "HTTP or HTTPS URL to fetch through flaresolverr.",
    }),
    extractMode: optionalStringEnum(["html", "text"] as const, {
      description: 'Extraction mode ("html" or "text"). Default: html.',
    }),
    maxChars: Type.Optional(
      Type.Number({
        description: "Maximum characters of body to return.",
        minimum: 100,
      }),
    ),
    timeoutMs: Type.Optional(
      Type.Number({
        description: "Timeout in milliseconds for the flaresolverr request.",
        minimum: 1000,
      }),
    ),
    waitMs: Type.Optional(
      Type.Number({
        description:
          "Milliseconds to wait after the page loads (and any Cloudflare challenge is solved) before capturing HTML. Use 3000-6000 for JS-hydrated pages that initially render a skeleton. Capped at 15000.",
        minimum: 0,
        maximum: 15000,
      }),
    ),
  },
  { additionalProperties: false },
);

export function createFlaresolverrFetchTool(api: OpenClawPluginApi) {
  return {
    name: "flaresolverr_fetch",
    label: "Flaresolverr Fetch",
    description:
      "Fetch a URL through flaresolverr to bypass Cloudflare anti-bot challenges. Use when web_fetch or browser tools hit a Cloudflare challenge page. Returns raw HTML (default) or stripped text.",
    parameters: FlaresolverrFetchToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const url = readStringParam(rawParams, "url", { required: true });
      const extractMode =
        readStringParam(rawParams, "extractMode") === "text" ? "text" : "html";
      const maxChars = readNumberParam(rawParams, "maxChars", { integer: true });
      const timeoutMs = readNumberParam(rawParams, "timeoutMs", { integer: true });
      const waitMs = readNumberParam(rawParams, "waitMs", { integer: true });

      return jsonResult(
        await runFlaresolverrFetch({
          cfg: api.config,
          url,
          extractMode,
          maxChars,
          timeoutMs,
          waitMs,
        }),
      );
    },
  };
}
