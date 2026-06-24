// ponytail: hardcoded model list — instant UI, no 28s API call. Add dynamic call later if needed.

export type ModelOption = {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  role: "agent" | "memory" | "both";
};

export const MODELS: ModelOption[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    providerLabel: "OpenAI",
    role: "agent",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "openai",
    providerLabel: "OpenAI",
    role: "agent",
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 mini",
    provider: "openai",
    providerLabel: "OpenAI",
    role: "agent",
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    role: "agent",
  },
  {
    id: "claude-opus-4-1",
    name: "Claude Opus 4.1",
    provider: "anthropic",
    providerLabel: "Anthropic",
    role: "agent",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    providerLabel: "Google",
    role: "agent",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    providerLabel: "Google",
    role: "agent",
  },
];

export const DEFAULT_MODEL = MODELS[0]!;
