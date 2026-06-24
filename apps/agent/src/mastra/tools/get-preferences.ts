import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getUserPreferences } from '../db/graph-service';

const requestContextValue = (
  context: { requestContext?: { get?: (key: string) => unknown } } | undefined,
  key: string,
): string | undefined => {
  const value = context?.requestContext?.get?.(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

export const getPreferencesTool = createTool({
  id: 'get-preferences',
  description:
    'Returns the user confirmed preference nodes, ordered by confidence. Used by the server to inject preferences into every response.',
  inputSchema: z.object({
    userId: z.string().min(1).optional(),
    limit: z.number().min(1).max(50).optional(),
  }),
  outputSchema: z.object({
    preferences: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        avgScore: z.number(),
        frequency: z.number(),
      }),
    ),
  }),
  execute: async (input, context) => {
    const userId =
      input.userId ?? requestContextValue(context, 'userId') ?? 'global';

    const nodes = await getUserPreferences(userId, {
      limit: input.limit,
    });

    return {
      preferences: nodes.map((node) => ({
        id: node.id,
        label: node.label,
        avgScore: node.avgScore,
        frequency: node.frequency,
      })),
    };
  },
});
