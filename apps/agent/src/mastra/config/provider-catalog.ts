import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { LlmProvider, ProviderModelConfig } from "./model-providers";
import { PROVIDER_API_KEY_ENV, PROVIDER_MODELS } from "./model-providers";

const require = createRequire(import.meta.url);

const _coreEntry = require.resolve("@mastra/core");
const _coreRoot = resolve(_coreEntry, "../..");
const _registryPath = resolve(_coreRoot, "dist", "provider-registry.json");

type ProviderRegistry = {
  providers: Record<
    string,
    {
      name?: string;
      models: string[];
    }
  >;
};

const registry: ProviderRegistry = JSON.parse(
  readFileSync(_registryPath, "utf-8"),
);

/** How many latest models to expose per connected provider in the picker. */
export const MAX_MODELS_PER_PROVIDER = 8;

const NON_CHAT_MODEL_PATTERN = /whisper|prompt-guard|embed|moderation|tts|transcri/i;

function extractVersion(name: string): number[] | null {
  const regex = /(\d+(?:[.\-]\d+)*)([a-zA-Z])?/g;
  const candidates: Array<{ numStr: string; suffix: string; index: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(name)) !== null) {
    candidates.push({
      numStr: match[1]!,
      suffix: match[2] ?? "",
      index: match.index,
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  const processed: number[][] = [];

  for (const candidate of candidates) {
    let parts = candidate.numStr.split(/[.\-]/).map(Number);

    if (/^[bBkKmMtT]$/.test(candidate.suffix)) {
      parts = parts.slice(0, -1);
      if (parts.length === 0) {
        continue;
      }
    }

    parts = parts.filter((part) => part < 2020);
    if (parts.length === 0) {
      continue;
    }

    if (parts.length === 1 && parts[0]! >= 100 && candidates.length > 1) {
      continue;
    }

    if (
      parts.length === 2 &&
      parts[0]! >= 1 &&
      parts[0]! <= 12 &&
      parts[1]! >= 1 &&
      parts[1]! <= 31 &&
      candidate.index > name.length / 2 &&
      candidates.length > 1
    ) {
      continue;
    }

    processed.push(parts);
  }

  return processed[0] ?? null;
}

function compareVersionsDesc(a: string, b: string): number {
  const versionA = extractVersion(a);
  const versionB = extractVersion(b);

  if (!versionA && !versionB) {
    return b.localeCompare(a);
  }
  if (!versionA) {
    return 1;
  }
  if (!versionB) {
    return -1;
  }

  const length = Math.max(versionA.length, versionB.length);
  for (let index = 0; index < length; index += 1) {
    const left = versionA[index] ?? 0;
    const right = versionB[index] ?? 0;
    if (right !== left) {
      return right - left;
    }
  }

  return b.localeCompare(a);
}

function toFullModelId(provider: LlmProvider, modelSlug: string): string {
  return `${provider}/${modelSlug}`;
}

function resolveModelRole(
  fullModelId: string,
  defaults: ProviderModelConfig,
): "agent" | "memory" | "both" {
  const isAgent = fullModelId === defaults.agent;
  const isMemory = fullModelId === defaults.memory;

  if (isAgent && isMemory) {
    return "both";
  }
  if (isAgent) {
    return "agent";
  }
  if (isMemory) {
    return "memory";
  }

  return "agent";
}

function isChatModel(modelSlug: string): boolean {
  return !NON_CHAT_MODEL_PATTERN.test(modelSlug);
}

/**
 * Returns the latest chat-capable models for a provider from Mastra's provider
 * registry, sorted newest-first. Project defaults are always included.
 */
export function getLatestModelsForProvider(
  provider: LlmProvider,
  limit = MAX_MODELS_PER_PROVIDER,
): string[] {
  const providerEntry = registry.providers[provider];
  const defaults = PROVIDER_MODELS[provider];
  const required = [defaults.agent, defaults.memory].filter(
    (model, index, list) => list.indexOf(model) === index,
  );

  if (!providerEntry?.models?.length) {
    return required;
  }

  const ranked = [...providerEntry.models]
    .filter(isChatModel)
    .sort(compareVersionsDesc)
    .map((slug: string) => toFullModelId(provider, slug));

  const merged = [...required];
  for (const modelId of ranked) {
    if (!merged.includes(modelId)) {
      merged.push(modelId);
    }
    if (merged.length >= limit) {
      break;
    }
  }

  return merged.slice(0, Math.max(limit, required.length));
}

export type CatalogModelEntry = {
  id: string;
  role: "agent" | "memory" | "both";
};

export type ConnectedProviderEntry = {
  provider: LlmProvider;
  connected: boolean;
  models: CatalogModelEntry[];
};

export function buildProviderModelCatalog(
  provider: LlmProvider,
): CatalogModelEntry[] {
  const defaults = PROVIDER_MODELS[provider];

  return getLatestModelsForProvider(provider).map((id) => ({
    id,
    role: resolveModelRole(id, defaults),
  }));
}

export function getConnectedProviders(): ConnectedProviderEntry[] {
  return (Object.keys(PROVIDER_MODELS) as LlmProvider[]).map((provider) => {
    const connected = Boolean(process.env[PROVIDER_API_KEY_ENV[provider]]);

    return {
      provider,
      connected,
      models: connected ? buildProviderModelCatalog(provider) : [],
    };
  });
}
