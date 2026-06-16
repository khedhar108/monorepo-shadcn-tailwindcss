import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { upsertEdges, upsertNodes } from '../db/graph-service';

const topicSchema = z.object({
  label: z.string().min(1),
  nodeType: z
    .enum(['topic', 'entity', 'concept', 'preference'])
    .default('topic'),
});

const requestContextValue = (
  context: { requestContext?: { get?: (key: string) => unknown } } | undefined,
  key: string,
): string | undefined => {
  const value = context?.requestContext?.get?.(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

export const topicExtractorTool = createTool({
  id: 'topic-extractor',
  description:
    'Persists 2–5 key topics from the current conversation turn into the user knowledge graph. Call after each assistant response with distilled topic labels.',
  inputSchema: z.object({
    userId: z.string().min(1).optional(),
    threadId: z.string().min(1).optional(),
    messageId: z.string().min(1).optional(),
    topics: z.array(topicSchema).min(2).max(5),
    userMessage: z.string().optional(),
    assistantMessage: z.string().optional(),
  }),
  outputSchema: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        frequency: z.number(),
        avgScore: z.number(),
      }),
    ),
    edges: z.array(
      z.object({
        id: z.string(),
        sourceId: z.string(),
        targetId: z.string(),
        weight: z.number(),
      }),
    ),
    topicLabels: z.array(z.string()),
  }),
  execute: async (input, context) => {
    const userId =
      input.userId ?? requestContextValue(context, 'userId') ?? 'anonymous-user';
    const threadId =
      input.threadId ?? requestContextValue(context, 'threadId') ?? 'anonymous-thread';
    const messageId = input.messageId ?? `message-${Date.now()}`;

    const nodes = await upsertNodes(
      input.topics.map((topic) => ({
        userId,
        label: topic.label,
        nodeType: topic.nodeType,
        messageId,
        threadId,
        metadata: {
          userMessage: input.userMessage,
          assistantMessage: input.assistantMessage,
        },
      })),
    );

    const edges = await upsertEdges(userId, nodes.map((node) => node.id));

    return {
      nodes: nodes.map((node) => ({
        id: node.id,
        label: node.label,
        frequency: node.frequency,
        avgScore: node.avgScore,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        weight: edge.weight,
      })),
      topicLabels: nodes.map((node) => node.label),
    };
  },
});
