/** A user's selected provider + model pair. */
export interface LlmSelection {
  /** Provider key, e.g. "openai" */
  provider: string;
  /** Full model string, e.g. "openai/gpt-5.2" */
  model: string;
  /** Human label, e.g. "GPT-5.2" */
  displayName?: string;
}

/** A provider and its models — used to populate the picker. */
export interface ProviderGroup {
  /** Provider key, e.g. "groq" */
  provider: string;
  /** Human label, e.g. "Groq" */
  displayName: string;
  /** Whether the provider's API key is set on the agent server */
  connected: boolean;
  /** Available models for this provider */
  models: Array<{
    /** Full model string, e.g. "groq/llama-3.3-70b-versatile" */
    id: string;
    /** Display name, e.g. "Llama 3.3 70B" */
    name: string;
    /** What this model is used for */
    role: "agent" | "memory" | "both";
  }>;
}

export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  groq: "Groq",
  nvidia: "NVIDIA",
  sarvam: "Sarvam",
};

export function formatModelName(modelId: string): string {
  const slug = modelId.split("/").pop() ?? modelId;
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
