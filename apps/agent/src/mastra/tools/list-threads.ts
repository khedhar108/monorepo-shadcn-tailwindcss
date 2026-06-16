import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDbClient } from '../db/client';
import { ensureGraphSchema } from '../db/schema';

export const listThreadsTool = createTool({
  id: 'list-threads',
  description:
    'Lists recent conversation threads for a user, with message counts and topic labels from the graph.',
  inputSchema: z.object({
    userId: z.string().min(1),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  outputSchema: z.object({
    threads: z.array(
      z.object({
        threadId: z.string(),
        messageCount: z.number(),
        feedbackCount: z.number(),
        lastActive: z.string(),
        topics: z.array(z.string()),
      }),
    ),
  }),
  execute: async (input) => {
    await ensureGraphSchema();

    const db = getDbClient();
    const limit = input.limit ?? 50;

    const threadResult = await db.execute({
      sql: `SELECT
        gm.thread_id,
        COUNT(DISTINCT gm.message_id) as message_count,
        COUNT(DISTINCT f.id) as feedback_count,
        MAX(gm.created_at) as last_active
      FROM graph_node_messages gm
      LEFT JOIN feedback f ON f.thread_id = gm.thread_id
      WHERE gm.node_id LIKE ?
      GROUP BY gm.thread_id
      ORDER BY last_active DESC
      LIMIT ?`,
      args: [`${input.userId}:%`, limit],
    });

    const threads = [];
    for (const row of threadResult.rows) {
      const r = row as Record<string, unknown>;
      const threadId = String(r.thread_id);

      const topicResult = await db.execute({
        sql: `SELECT DISTINCT gn.label
        FROM graph_node_messages gnm
        JOIN graph_nodes gn ON gn.id = gnm.node_id
        WHERE gnm.thread_id = ?
        ORDER BY gn.frequency DESC
        LIMIT 5`,
        args: [threadId],
      });

      const topics = topicResult.rows.map(
        (t) => String((t as Record<string, unknown>).label),
      );

      threads.push({
        threadId,
        messageCount: Number(r.message_count),
        feedbackCount: Number(r.feedback_count),
        lastActive: String(r.last_active),
        topics,
      });
    }

    return { threads };
  },
});
