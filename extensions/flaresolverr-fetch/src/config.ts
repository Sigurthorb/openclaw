import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { normalizeSecretInput } from "openclaw/plugin-sdk/secret-input";

export const DEFAULT_FLARESOLVERR_ENDPOINT = "http://flaresolverr:8191";
export const DEFAULT_FLARESOLVERR_TIMEOUT_SECONDS = 60;
export const DEFAULT_FLARESOLVERR_MAX_CHARS = 100_000;
const FLARESOLVERR_ENDPOINT_ENV_VAR = "FLARESOLVERR_ENDPOINT";

type PluginEntryConfig =
  | {
      endpoint?: string;
      defaultTimeoutSeconds?: number;
      defaultMaxChars?: number;
    }
  | undefined;

function resolvePluginConfig(cfg?: OpenClawConfig): PluginEntryConfig {
  const entry = cfg?.plugins?.entries?.["flaresolverr-fetch"]?.config as PluginEntryConfig;
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return entry;
  }
  return undefined;
}

export function resolveFlaresolverrEndpoint(cfg?: OpenClawConfig): string {
  const pluginConfig = resolvePluginConfig(cfg);
  const configured =
    (typeof pluginConfig?.endpoint === "string" ? pluginConfig.endpoint.trim() : "") ||
    normalizeSecretInput(process.env[FLARESOLVERR_ENDPOINT_ENV_VAR]) ||
    "";
  return configured || DEFAULT_FLARESOLVERR_ENDPOINT;
}

export function resolveFlaresolverrTimeoutSeconds(
  cfg?: OpenClawConfig,
  override?: number,
): number {
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
  return DEFAULT_FLARESOLVERR_TIMEOUT_SECONDS;
}

export function resolveFlaresolverrMaxChars(cfg?: OpenClawConfig, override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const pluginConfig = resolvePluginConfig(cfg);
  if (
    typeof pluginConfig?.defaultMaxChars === "number" &&
    Number.isFinite(pluginConfig.defaultMaxChars) &&
    pluginConfig.defaultMaxChars > 0
  ) {
    return Math.floor(pluginConfig.defaultMaxChars);
  }
  return DEFAULT_FLARESOLVERR_MAX_CHARS;
}
