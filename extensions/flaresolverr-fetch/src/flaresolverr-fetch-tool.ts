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
    timeoutSeconds: Type.Optional(
      Type.Number({
        description: "Timeout in seconds for the flaresolverr request.",
        minimum: 1,
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
      const timeoutSeconds = readNumberParam(rawParams, "timeoutSeconds", {
        integer: true,
      });

      return jsonResult(
        await runFlaresolverrFetch({
          cfg: api.config,
          url,
          extractMode,
          maxChars,
          timeoutSeconds,
        }),
      );
    },
  };
}
