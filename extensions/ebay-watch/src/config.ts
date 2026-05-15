import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { normalizeSecretInput } from "openclaw/plugin-sdk/secret-input";

export const DEFAULT_FLARESOLVERR_ENDPOINT = "http://flaresolverr:8191";
export const DEFAULT_TIMEOUT_SECONDS = 60;
export const DEFAULT_MAX_RESULTS = 20;
const FLARESOLVERR_ENDPOINT_ENV_VAR = "FLARESOLVERR_ENDPOINT";

type PluginEntryConfig =
  | {
      flaresolverrEndpoint?: string;
      defaultTimeoutSeconds?: number;
      defaultMaxResults?: number;
    }
  | undefined;

function resolvePluginConfig(cfg?: OpenClawConfig): PluginEntryConfig {
  const entry = cfg?.plugins?.entries?.["ebay-watch"]?.config as PluginEntryConfig;
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return entry;
  }
  return undefined;
}

export function resolveFlaresolverrEndpoint(cfg?: OpenClawConfig): string {
  const pluginConfig = resolvePluginConfig(cfg);
  const configured =
    (typeof pluginConfig?.flaresolverrEndpoint === "string"
      ? pluginConfig.flaresolverrEndpoint.trim()
      : "") ||
    normalizeSecretInput(process.env[FLARESOLVERR_ENDPOINT_ENV_VAR]) ||
    "";
  return configured || DEFAULT_FLARESOLVERR_ENDPOINT;
}

export function resolveTimeoutSeconds(cfg?: OpenClawConfig, override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const pluginConfig = resolvePluginConfig(cfg);
  if (
    typeof pluginConfig?.defaultTimeoutSeconds === "number" &&
    Number.isFinite(pluginConfig.defaultTimeoutSeconds) &&
    pluginConfig.defaultTimeoutSeconds > 0
  ) {
    return Math.floor(pluginConfig.defaultTimeoutSeconds);
  }
  return DEFAULT_TIMEOUT_SECONDS;
}

export function resolveMaxResults(cfg?: OpenClawConfig, override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.min(100, Math.floor(override));
  }
  const pluginConfig = resolvePluginConfig(cfg);
  if (
    typeof pluginConfig?.defaultMaxResults === "number" &&
    Number.isFinite(pluginConfig.defaultMaxResults) &&
    pluginConfig.defaultMaxResults > 0
  ) {
    return Math.min(100, Math.floor(pluginConfig.defaultMaxResults));
  }
  return DEFAULT_MAX_RESULTS;
}
