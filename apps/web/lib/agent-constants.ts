export const AGENT_IDS = {
  feedbackSummarizer: "feedbackSummarizer",
  ariaAgent: "ariaAgent",
} as const;

export type AgentId = (typeof AGENT_IDS)[keyof typeof AGENT_IDS];

/** @deprecated Use ARIA_AGENT_ID for the adaptive knowledge-graph chatbot. */
export const FEEDBACK_AGENT_ID = AGENT_IDS.feedbackSummarizer;

export const ARIA_AGENT_ID = AGENT_IDS.ariaAgent;

/** Global graph user — the knowledge graph is shared across all users and threads. */
export const GLOBAL_GRAPH_USER = "global";
