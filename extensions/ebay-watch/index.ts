import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { createEbaySearchTool } from "./src/ebay-search-tool.js";

export default definePluginEntry({
  id: "ebay-watch",
  name: "eBay Watch Plugin",
  description:
    "Search eBay listings through a self-hosted flaresolverr instance and return structured deal candidates.",
  register(api) {
    api.registerTool(createEbaySearchTool(api) as AnyAgentTool);
  },
});
