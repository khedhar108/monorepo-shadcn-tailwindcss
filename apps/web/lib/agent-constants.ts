export const AGENT_IDS = {
  feedbackSummarizer: "feedbackSummarizer",
} as const;

export type AgentId = (typeof AGENT_IDS)[keyof typeof AGENT_IDS];

export const FEEDBACK_AGENT_ID = AGENT_IDS.feedbackSummarizer;
