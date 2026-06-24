import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getGraph } from '../db/graph-service';

export const graphQueryTool = createTool({
  id: 'graph-query',
  description:
    'Reads the user knowledge graph so you can reference recurring interests, connected topics, and feedback-weighted themes in your replies.',
  inputSchema: z.object({
    userId: z.string().min(1),
    minScore: z.number().min(0).max(1).optional(),
    since: z.string().optional(),
    nodeType: z.enum(['topic', 'entity', 'concept', 'preference']).optional(),
    graphKind: z.enum(['exploration', 'preference', 'all']).optional(),
    limit: z.number().int().min(1).max(500).default(50),
  }),
  outputSchema: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        nodeType: z.string(),
        graphKind: z.string().optional(),
        frequency: z.number(),
        avgScore: z.number(),
        lastSeen: z.string(),
      }),
    ),
    edges: z.array(
      z.object({
        id: z.string(),
        sourceId: z.string(),
        targetId: z.string(),
        weight: z.number(),
        edgeType: z.string(),
      }),
    ),
    summary: z.string(),
  }),
  execute: async (input) => {
    const graph = await getGraph({
      userId: input.userId,
      minScore: input.minScore,
      since: input.since,
      nodeType: input.nodeType,
      graphKind: input.graphKind,
      limit: input.limit,
    });

    const topTopics = [...graph.nodes]
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5)
      .map((node) => `${node.label} (freq ${node.frequency}, score ${node.avgScore.toFixed(2)})`);

    const rewardedTopics = graph.nodes
      .filter((node) => node.avgScore >= 0.7)
      .slice(0, 4)
      .map((node) => node.label);

    const needsAdjustmentTopics = graph.nodes
      .filter((node) => node.avgScore < 0.4)
      .slice(0, 4)
      .map((node) => node.label);

    const preferenceNodes = graph.nodes.filter(
      (node) => node.graphKind === 'preference' || node.nodeType === 'preference',
    );
    const preferenceLabels = preferenceNodes
      .slice(0, 6)
      .map((node) => `${node.label} (${(node.avgScore * 100).toFixed(0)}%)`);

    const summary =
      topTopics.length > 0
        ? `Top interests: ${topTopics.join('; ')}. Rewarded patterns: ${
            rewardedTopics.join(', ') || 'none yet'
          }. Needs adjustment: ${
            needsAdjustmentTopics.join(', ') || 'none yet'
          }. User preferences: ${
            preferenceLabels.join(', ') || 'none yet'
          }. ${graph.edges.length} connections across ${graph.nodes.length} nodes.`
        : 'No knowledge graph data yet for this user.';

    return {
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        nodeType: node.nodeType,
        graphKind: node.graphKind,
        frequency: node.frequency,
        avgScore: node.avgScore,
        lastSeen: node.lastSeen,
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        weight: edge.weight,
        edgeType: edge.edgeType,
      })),
      summary,
    };
  },
});
