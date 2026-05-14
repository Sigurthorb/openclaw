import { buildManifestModelProviderConfig } from "openclaw/plugin-sdk/provider-catalog-shared";
import type {
  ModelDefinitionConfig,
  ModelProviderConfig,
} from "openclaw/plugin-sdk/provider-model-shared";
import manifest from "./openclaw.plugin.json" with { type: "json" };

const CLAWO_MANIFEST_PROVIDER = buildManifestModelProviderConfig({
  providerId: "clawo",
  catalog: manifest.modelCatalog.providers.clawo,
});

export const CLAWO_BASE_URL = CLAWO_MANIFEST_PROVIDER.baseUrl;
export const CLAWO_MODEL_CATALOG: ModelDefinitionConfig[] = CLAWO_MANIFEST_PROVIDER.models;

function buildClawoModelDefinition(model: ModelDefinitionConfig): ModelDefinitionConfig {
  return {
    ...model,
    api: "openai-completions",
  };
}

export function buildClawoProvider(): ModelProviderConfig {
  return {
    baseUrl: CLAWO_BASE_URL,
    api: "openai-completions",
    models: CLAWO_MODEL_CATALOG.map(buildClawoModelDefinition),
  };
}
