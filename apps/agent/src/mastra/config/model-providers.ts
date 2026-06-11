export type LlmProvider =
  | "openai"
  | "groq"
  | "nvidia"
  | "sarvam"
  | "anthropic"
  | "openrouter";

export type ProviderModelConfig = {
  agent: string;
  memory: string;
};

/**
 * These are the app-level defaults for each provider.
 *
 * Important:
 * - This file does NOT define the full set of models available in Mastra Studio.
 * - Studio can show many models from the same provider because Mastra reads its
 *   provider registry, which contains the broader catalog for each provider.
 * - This file only answers: "If this provider is active, which agent model and
 *   memory model should this project use by default?"
 * - You can still override these defaults with `LLM_AGENT_MODEL`,
 *   `LLM_MEMORY_MODEL`, or later with request-scoped selection in the app.
 *
 * Verified against https://mastra.ai/models/providers
 */
export const PROVIDER_MODELS: Record<LlmProvider, ProviderModelConfig> = {
  openai: {
    agent: "openai/gpt-5.2",
    memory: "openai/gpt-5-mini",
  },
  groq: {
    agent: "groq/llama-3.3-70b-versatile",
    memory: "groq/llama-3.1-8b-instant",
  },
  nvidia: {
    agent: "nvidia/meta/llama-3.3-70b-instruct",
    memory: "nvidia/meta/llama-3.1-8b-instruct",
  },
  sarvam: {
    agent: "sarvam/sarvam-105b",
    memory: "sarvam/sarvam-30b",
  },
  anthropic: {
    agent: "anthropic/claude-sonnet-4-6",
    memory: "anthropic/claude-haiku-4-5",
  },
  openrouter: {
    agent: "openrouter/anthropic/claude-sonnet-4-6",
    memory: "openrouter/anthropic/claude-haiku-4-5",
  },
};

export const PROVIDER_API_KEY_ENV: Record<LlmProvider, string> = {
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  sarvam: "SARVAM_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

function parseProvider(value: string | undefined): LlmProvider {
  if (value && value in PROVIDER_MODELS) {
    return value as LlmProvider;
  }
  return "openai";
}

export function getActiveProvider(): LlmProvider {
  return parseProvider(process.env.LLM_PROVIDER);
}

export function getAgentModel(
  provider: LlmProvider = getActiveProvider(),
): string {
  return process.env.LLM_AGENT_MODEL ?? PROVIDER_MODELS[provider].agent;
}

export function getMemoryModel(
  provider: LlmProvider = getActiveProvider(),
): string {
  return process.env.LLM_MEMORY_MODEL ?? PROVIDER_MODELS[provider].memory;
}

export function resolveAgentModel(requestContext?: {
  get?: (key: string) => unknown;
}): string {
  const modelOverride = requestContext?.get?.("llmModel");
  if (typeof modelOverride === "string" && modelOverride.includes("/")) {
    return modelOverride;
  }

  const override = requestContext?.get?.("llmProvider");
  if (typeof override === "string" && override in PROVIDER_MODELS) {
    return getAgentModel(override as LlmProvider);
  }

  return getAgentModel();
}
