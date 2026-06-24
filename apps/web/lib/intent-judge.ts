import { generateObject } from "ai";
import { resolveModelConfig } from "@mastra/core/llm";
import { z } from "zod";
import type { NormalizedChatMessage } from "./mastra-guardrails";
import { regexFallback, type Judgment } from "./tool-router";

const IntentSchema = z.object({
  intent: z.enum([
    "smalltalk",
    "substantive",
    "history",
    "providers",
    "preference_feedback",
  ]),
  toolOrder: z.array(z.string()),
  useBehaviorContext: z.boolean(),
  reason: z.string(),
});

const JUDGE_SYSTEM_PROMPT = `You are an intent classifier for the ARIA adaptive assistant.
Given the user's latest message, classify it into one of these intents and decide which tools the agent should use.

## Intents

- **smalltalk**: Greetings, thanks, acknowledgements, very short replies. No tools needed.
- **substantive**: A real question or request that warrants a thoughtful answer. Tools: topicExtractorTool, graphQueryTool. Behavior context is relevant.
- **history**: User asks about their past conversations, explored topics, or patterns. Tools: graphQueryTool, listThreadsTool, topicExtractorTool. Behavior context is relevant.
- **providers**: User asks about available LLM models/providers or wants to switch. Tools: getAvailableProvidersTool. Behavior context not needed.
- **preference_feedback**: User expresses a preference about response style (e.g. "be more concise", "I wish you were shorter", "give me more detail"). No tools needed, but behavior context is relevant so the preference can be captured.

## Rules

- toolOrder should list agent tool-object keys in priority order.
- For smalltalk, toolOrder should be empty.
- useBehaviorContext should be true for substantive, history, and preference_feedback.
- Keep reason brief (one sentence).

## Available tool keys
- topicExtractorTool
- graphQueryTool
- listThreadsTool
- getAvailableProvidersTool`;

function resolveJudgeModelConfig(): string {
  return (
    process.env.ARIA_JUDGE_MODEL ??
    process.env.LLM_MEMORY_MODEL ??
    "openai/gpt-5-mini"
  );
}

export async function classifyIntentLLM(
  messages: NormalizedChatMessage[],
): Promise<Judgment> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userContent =
    typeof lastUser?.content === "string" ? lastUser.content : "";

  try {
    const model = await resolveModelConfig(resolveJudgeModelConfig());

    const { object } = await generateObject({
      model: model as unknown as Parameters<typeof generateObject>[0]["model"],
      schema: IntentSchema,
      system: JUDGE_SYSTEM_PROMPT,
      prompt: userContent,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(
        parseInt(process.env.ARIA_JUDGE_TIMEOUT_MS ?? "2500", 10),
      ),
    });

    return object as Judgment;
  } catch {
    return regexFallback(userContent);
  }
}
