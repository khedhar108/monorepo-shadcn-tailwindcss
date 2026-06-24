/**
 * Tool routing layer.
 *
 * Decides which tools the LLM may see for a given user message so the agent
 * doesn't ship every tool schema on every turn. Tools that must remain
 * directly executable (feedback-recorder, topic-extractor) stay registered on
 * the agent but are hidden from the model unless the route explicitly
 * activates them.
 */

export type ToolIntent = "smalltalk" | "substantive" | "history" | "providers";

export type ToolRoute = {
  intent: ToolIntent;
  /** Agent tool-object keys the LLM is allowed to call this turn. */
  activeTools: string[];
  /** Passed as `toolChoice` to the Mastra stream options. */
  toolChoice: "none" | "auto";
};

/**
 * Judgment shape produced by the LLM intent judge (C1) and the regex
 * fallback (C2). This is the unified routing decision consumed by route.ts.
 */
export type Judgment = {
  intent: ToolIntent | "preference_feedback";
  toolOrder: string[];
  useBehaviorContext: boolean;
  reason: string;
};

/**
 * Object keys from `aria-agent.ts` `tools: { ... }`.
 * These differ from the tool `id` used by `executeAgentTool`.
 */
export const TOOL_KEYS = {
  topicExtractor: "topicExtractorTool",
  graphQuery: "graphQueryTool",
  listThreads: "listThreadsTool",
  getProviders: "getAvailableProvidersTool",
} as const;

const SMALL_TALK_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|yo|sup|hiya|howdy|greetings)\b/i,
  /^(good (morning|afternoon|evening|night))\b/i,
  /^(thanks|thank you|thx|ty|appreciate(d)?|cheers)\b/i,
  /^(bye|goodbye|see you|cya|later|farewell)\b/i,
  /^(how are you|how's it going|what's up|how do you do|how are things)\b/i,
  /^(ok|okay|k|sure|cool|nice|great|got it|understood|sounds good|will do)\b/i,
  /^(yes|no|yep|nope|yeah|nah|yup)\b/i,
  /^(lol|lmao|haha|hehe)\b/i,
  /^(👍|🙏|😄|😊|🙂|👋)\b/,
];

const PROVIDER_PATTERNS: RegExp[] = [
  /\b(what|which|list|show)\b.*\b(models?|providers?|llms?)\b/i,
  /\bavailable\s+(models?|providers?|llms?)\b/i,
  /\b(switch|change|use|pick|select)\b.*\b(model|provider|llm)\b/i,
  /\bprovider\s+(status|connection|connected|available)\b/i,
];

const HISTORY_PATTERNS: RegExp[] = [
  /\bmy\s+(history|past|previous|recent)\b/i,
  /\bwhat\s+have\s+i\s+(explored|asked|discussed|talked|chatted|searched)\b/i,
  /\brecent\s+(topics|conversations|threads|chats|questions)\b/i,
  /\bmy\s+(threads|conversations|chats|questions)\b/i,
  /\bshow\s+(me\s+)?(my|the)\s+(history|past|previous)\b/i,
  /\bwhat\s+(patterns|topics)\s+have\s+i\b/i,
  /\bconversation\s+(history|log)\b/i,
  /\bwhat\s+did\s+i\s+(ask|talk|explore)\b/i,
];

export function classifyIntent(message: string): ToolIntent {
  const trimmed = message.trim();
  if (trimmed.length < 3) return "smalltalk";

  for (const re of SMALL_TALK_PATTERNS) {
    if (re.test(trimmed)) return "smalltalk";
  }

  for (const re of PROVIDER_PATTERNS) {
    if (re.test(trimmed)) return "providers";
  }

  for (const re of HISTORY_PATTERNS) {
    if (re.test(trimmed)) return "history";
  }

  return "substantive";
}

/**
 * Maps a user message to the tool set the LLM should see this turn.
 *
 * - `feedbackRecorderTool` is NEVER activated for the LLM; feedback is
 *   recorded out-of-band via `/api/feedback` → `executeAgentTool`.
 * - `topicExtractorTool` is only activated for substantive turns so the
 *   knowledge graph updates without polluting trivial exchanges.
 */
export function routeTools(message: string): ToolRoute {
  const intent = classifyIntent(message);

  switch (intent) {
    case "smalltalk":
      return { intent, activeTools: [], toolChoice: "none" };
    case "providers":
      return {
        intent,
        activeTools: [TOOL_KEYS.getProviders],
        toolChoice: "auto",
      };
    case "history":
      return {
        intent,
        activeTools: [
          TOOL_KEYS.topicExtractor,
          TOOL_KEYS.listThreads,
          TOOL_KEYS.graphQuery,
        ],
        toolChoice: "auto",
      };
    case "substantive":
      return {
        intent,
        activeTools: [TOOL_KEYS.topicExtractor, TOOL_KEYS.graphQuery],
        toolChoice: "auto",
      };
  }
}

/**
 * Regex-based fallback for the LLM intent judge (C1).
 * Maps the existing `routeTools` result into the `Judgment` shape so
 * route.ts has a single interface regardless of which path produced it.
 */
export function regexFallback(message: string): Judgment {
  const route = routeTools(message);
  const useBehaviorContext =
    route.intent === "substantive" || route.intent === "history";
  return {
    intent: route.intent,
    toolOrder: route.activeTools,
    useBehaviorContext,
    reason: `regex fallback: ${route.intent}`,
  };
}
