import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { createFlaresolverrFetchTool } from "./src/flaresolverr-fetch-tool.js";

export default definePluginEntry({
  id: "flaresolverr-fetch",
  name: "Flaresolverr Fetch Plugin",
  description:
    "Fetches URLs through a flaresolverr instance to bypass Cloudflare anti-bot challenges.",
  register(api) {
    api.registerTool(createFlaresolverrFetchTool(api) as AnyAgentTool);
  },
});
