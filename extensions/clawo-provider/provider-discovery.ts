import type { ProviderPlugin } from "openclaw/plugin-sdk/provider-model-shared";
import { buildClawoProvider } from "./provider-catalog.js";

const clawoProviderDiscovery: ProviderPlugin = {
  id: "clawo",
  label: "Clawo (Claude Code via Max)",
  docsPath: "/providers/clawo",
  auth: [],
  staticCatalog: {
    order: "simple",
    run: async () => ({
      provider: buildClawoProvider(),
    }),
  },
};

export default clawoProviderDiscovery;
