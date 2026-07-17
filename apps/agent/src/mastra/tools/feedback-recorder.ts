import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  getRecentNodeIds,
  getThreadTopicNodeIds,
  recordFeedback,
  updateNodeScores,
  upsertPreferenceNode,
} from '../db/graph-service';
import { computeFeedbackScore } from '../scorers/feedback-scorer';
import { derivePreferenceLabel } from './derive-preference';

const requestContextValue = (
  context: { requestContext?: { get?: (key: string) => unknown } } | undefined,
  key: string,
): string | undefined => {
  const value = context?.requestContext?.get?.(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

export const feedbackRecorderTool = createTool({
  id: 'feedback-recorder',
  description:
    'Records feedback for an assistant message, updates graph node scores, and derives a preference node so ARIA adapts future answers.',
  inputSchema: z.object({
    userId: z.string().min(1).optional(),
    messageId: z.string().min(1),
    threadId: z.string().min(1).optional(),
    thumbs: z.enum(['up', 'down']).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().max(1000).optional(),
    nodeIds: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    score: z.number(),
    updatedNodeIds: z.array(z.string()),
    preferenceLabel: z.string().nullable(),
    message: z.string(),
  }),
  execute: async (input, context) => {
    const userId =
      input.userId ?? requestContextValue(context, 'userId') ?? 'global';
    const threadId =
      input.threadId ?? requestContextValue(context, 'threadId') ?? 'anonymous-thread';
    const score = computeFeedbackScore(input);
    const feedbackId = `${threadId}:${input.messageId}:${Date.now()}`;

    // 1) Record raw feedback
    await recordFeedback({
      id: feedbackId,
      userId,
      messageId: input.messageId,
      threadId,
      thumbs: input.thumbs,
      rating: input.rating,
      comment: input.comment,
      score,
    });

    // 2) Resolve exploration topics most recently associated with this thread
    //    (ponytail: recency-within-thread — no message-ID alignment needed)
    let topicNodeIds: string[] = [];
    try {
      topicNodeIds = await getThreadTopicNodeIds(userId, threadId);
    } catch (error) {
      console.error('[feedback-recorder] thread topic lookup failed:', error);
    }

    // 3) Derive a preference label and upsert a preference node wired to those topics
    let preferenceLabel: string | null = null;
    try {
      const derived = derivePreferenceLabel({
        thumbs: input.thumbs,
        rating: input.rating,
        comment: input.comment,
      });

      if (derived) {
        preferenceLabel = derived.label;
        await upsertPreferenceNode({
          userId,
          label: derived.label,
          score,
          source: 'feedback',
          threadId,
          topicNodeIds,
        });
      }
    } catch (error) {
      console.error('[feedback-recorder] preference derivation failed:', error);
    }

    // 4) Rescore the rated message's topics, not generic most-recent nodes
    const updatedNodeIds =
      topicNodeIds.length > 0
        ? topicNodeIds
        : input.nodeIds && input.nodeIds.length > 0
          ? input.nodeIds
          : await getRecentNodeIds(userId);

    await updateNodeScores(updatedNodeIds, score);

    return {
      score,
      updatedNodeIds,
      preferenceLabel,
      message:
        preferenceLabel
          ? `Feedback recorded. Saved preference: ${preferenceLabel}.`
          : updatedNodeIds.length > 0
            ? 'Feedback recorded and graph scores updated.'
            : 'Feedback recorded. No graph nodes were available to update yet.',
    };
  },
});
