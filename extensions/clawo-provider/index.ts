  import fs from "node:fs";
  import os from "node:os";
  import path from "node:path";
  import { CUSTOM_LOCAL_AUTH_MARKER } from "openclaw/plugin-sdk/provider-auth";
  import { readConfiguredProviderCatalogEntries } from "openclaw/plugin-sdk/provider-catalog-shared";
  import { defineSingleProviderPluginEntry } from "openclaw/plugin-sdk/provider-entry";
  import { buildProviderReplayFamilyHooks } from "openclaw/plugin-sdk/provider-model-shared";
  import { buildClawoProvider } from "./provider-catalog.js";
  
  const PROVIDER_ID = "clawo";
  const SERVER_TOKEN_PATH = path.join(os.homedir(), ".openclaw", "server-token");
  
  function readClawoServerToken(): string | undefined {
    try {
      const raw = fs.readFileSync(SERVER_TOKEN_PATH, "utf8").trim();
      return raw.length > 0 ? raw : undefined;
    } catch {
      return undefined;
    }
  }
  
  export default defineSingleProviderPluginEntry({
    id: PROVIDER_ID,
    name: "Clawo Provider",
    description:
      "Routes the main agent through claw-orchestrator to Claude Code authenticated via Claude Max subscription.",
    provider: {
      label: "Clawo (Claude Code via Max)",
      docsPath: "/providers/clawo",
      auth: [],
      catalog: {
        buildProvider: buildClawoProvider,
      },
      resolveSyntheticAuth: () => {
        const token = readClawoServerToken();
        return {
          apiKey: token ?? CUSTOM_LOCAL_AUTH_MARKER,
          source: token
            ? "~/.openclaw/server-token"
            : "clawo on localhost (auth disabled)",
          mode: "api-key" as const,
        };
      },
      augmentModelCatalog: ({ config }) =>
        readConfiguredProviderCatalogEntries({
          config,
          providerId: PROVIDER_ID,
        }),
      ...buildProviderReplayFamilyHooks({
        family: "openai-compatible",
        dropReasoningFromHistory: false,
      }),
    },
  });
