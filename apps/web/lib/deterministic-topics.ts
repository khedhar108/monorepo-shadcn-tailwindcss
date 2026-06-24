import { executeAgentTool } from "./mastra-client";
import { ARIA_AGENT_ID } from "./agent-constants";

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "under", "further", "then", "once", "here", "there", "when",
  "where", "why", "how", "all", "each", "every", "both", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "just", "also", "but", "and",
  "or", "if", "while", "about", "what", "which", "this", "that", "these",
  "those", "i", "you", "he", "she", "it", "we", "they", "me", "him",
  "her", "us", "them", "my", "your", "his", "its", "our", "their",
  "like", "want", "know", "think", "get", "got", "make", "made", "go",
  "going", "one", "two", "three", "yes", "no", "ok", "okay", "hey",
  "hi", "hello", "thanks", "thank", "please", "help", "use", "using",
  "used", "way", "thing", "things", "stuff", "lot", "bit", "kind",
  "tell", "say", "said", "show", "give", "let", "put", "now", "still",
  "even", "much", "many", "well", "back", "out", "up", "down", "over",
]);

function extractKeywords(text: string, max = 5): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);

  return sorted.map((w) => w.charAt(0).toUpperCase() + w.slice(1));
}

export async function extractTopicsDeterministically(input: {
  userId: string;
  threadId: string;
  messageId: string;
  userMessage: string;
  assistantMessage: string;
}): Promise<void> {
  const combined = `${input.userMessage} ${input.assistantMessage}`;
  const labels = extractKeywords(combined, 5);

  if (labels.length < 2) {
    return;
  }

  const topics = labels.map((label) => ({
    label,
    nodeType: "topic" as const,
  }));

  try {
    await executeAgentTool({
      agentId: ARIA_AGENT_ID,
      toolId: "topic-extractor",
      data: {
        userId: input.userId,
        threadId: input.threadId,
        messageId: input.messageId,
        topics,
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
      },
      requestContext: {
        userId: input.userId,
        threadId: input.threadId,
      },
    });
  } catch (error) {
    console.error("[deterministic-topics] extraction failed:", error);
  }
}
