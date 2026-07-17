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
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
};

export function formatModelName(modelId: string): string {
  const slug = modelId.split("/").pop() ?? modelId;
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/* ── Persisted message parts (tool/reasoning history round-trip) ── */

/**
 * A storage-safe subset of the AI SDK's UIMessage parts. Only terminal tool
 * states are persisted; live-only states (input-streaming, input-available)
 * collapse to output-available/output-error on finish. The renderer's
 * isToolPart()/AgentToolPart consume this shape unchanged.
 */
export type SerializablePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "dynamic-tool";
      toolName: string;
      state: "output-available" | "output-error";
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };

/**
 * A persisted chat message. `content` is the plain-text fallback (and the
 * field all existing text consumers read); `parts` carries the structured
 * reasoning/tool flow for assistant turns. Omitted for user messages and
 * for pre-parts history entries (graceful fallback).
 */
export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  parts?: SerializablePart[];
};
