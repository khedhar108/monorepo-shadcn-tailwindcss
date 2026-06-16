import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  getRecentNodeIds,
  recordFeedback,
  updateNodeScores,
} from '../db/graph-service';
import { computeFeedbackScore } from '../scorers/feedback-scorer';

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
    'Records feedback for an assistant message and updates graph node scores so ARIA adapts future answers.',
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
    message: z.string(),
  }),
  execute: async (input, context) => {
    const userId =
      input.userId ?? requestContextValue(context, 'userId') ?? 'anonymous-user';
    const threadId =
      input.threadId ?? requestContextValue(context, 'threadId') ?? 'anonymous-thread';
    const score = computeFeedbackScore(input);
    const feedbackId = `${threadId}:${input.messageId}:${Date.now()}`;

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

    const updatedNodeIds =
      input.nodeIds && input.nodeIds.length > 0
        ? input.nodeIds
        : await getRecentNodeIds(userId);

    await updateNodeScores(updatedNodeIds, score);

    return {
      score,
      updatedNodeIds,
      message:
        updatedNodeIds.length > 0
          ? 'Feedback recorded and graph scores updated.'
          : 'Feedback recorded. No graph nodes were available to update yet.',
    };
  },
});
