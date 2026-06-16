import { getDbClient } from './client';
import { ensureGraphSchema } from './schema';

export type GraphNodeType = 'topic' | 'entity' | 'concept' | 'preference';
export type GraphEdgeType = 'co_occurrence' | 'preference' | 'causal';

export type GraphNode = {
  id: string;
  userId: string;
  label: string;
  nodeType: GraphNodeType;
  frequency: number;
  avgScore: number;
  firstSeen: string;
  lastSeen: string;
  metadata: Record<string, unknown> | null;
};

export type GraphEdge = {
  id: string;
  userId: string;
  sourceId: string;
  targetId: string;
  edgeType: GraphEdgeType;
  weight: number;
  createdAt: string;
};

export type GraphSnapshot = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type FeedbackRecordInput = {
  id: string;
  userId: string;
  messageId: string;
  threadId: string;
  thumbs?: 'up' | 'down';
  rating?: number;
  comment?: string;
  score: number;
};

export type UpsertTopicInput = {
  userId: string;
  label: string;
  nodeType?: GraphNodeType;
  messageId?: string;
  threadId?: string;
  metadata?: Record<string, unknown>;
};

export type GraphQueryFilters = {
  userId: string;
  minScore?: number;
  since?: string;
  nodeType?: GraphNodeType;
  limit?: number;
};

function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildNodeId(userId: string, label: string): string {
  return `${userId}:${slugifyLabel(label)}`;
}

function mapNodeRow(row: Record<string, unknown>): GraphNode {
  const metadataRaw = row.metadata;

  return {
    id: String(row.id),
    userId: String(row.user_id),
    label: String(row.label),
    nodeType: String(row.node_type) as GraphNodeType,
    frequency: Number(row.frequency),
    avgScore: Number(row.avg_score),
    firstSeen: String(row.first_seen),
    lastSeen: String(row.last_seen),
    metadata:
      typeof metadataRaw === 'string' && metadataRaw.length > 0
        ? (JSON.parse(metadataRaw) as Record<string, unknown>)
        : null,
  };
}

function mapEdgeRow(row: Record<string, unknown>): GraphEdge {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    sourceId: String(row.source_id),
    targetId: String(row.target_id),
    edgeType: String(row.edge_type) as GraphEdgeType,
    weight: Number(row.weight),
    createdAt: String(row.created_at),
  };
}

export async function upsertNodes(
  topics: UpsertTopicInput[],
): Promise<GraphNode[]> {
  await ensureGraphSchema();

  const db = getDbClient();
  const upserted: GraphNode[] = [];

  for (const topic of topics) {
    const id = buildNodeId(topic.userId, topic.label);
    const nodeType = topic.nodeType ?? 'topic';
    const metadata = topic.metadata ? JSON.stringify(topic.metadata) : null;

    await db.execute({
      sql: `INSERT INTO graph_nodes (
        id, user_id, label, node_type, frequency, avg_score, first_seen, last_seen, metadata
      ) VALUES (?, ?, ?, ?, 1, 0.5, datetime('now'), datetime('now'), ?)
      ON CONFLICT(id) DO UPDATE SET
        frequency = frequency + 1,
        last_seen = datetime('now'),
        metadata = COALESCE(excluded.metadata, graph_nodes.metadata)`,
      args: [id, topic.userId, topic.label.trim(), nodeType, metadata],
    });

    if (topic.messageId && topic.threadId) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO graph_node_messages (node_id, message_id, thread_id)
              VALUES (?, ?, ?)`,
        args: [id, topic.messageId, topic.threadId],
      });
    }

    const result = await db.execute({
      sql: `SELECT * FROM graph_nodes WHERE id = ?`,
      args: [id],
    });

    const row = result.rows[0];
    if (row) {
      upserted.push(mapNodeRow(row as Record<string, unknown>));
    }
  }

  return upserted;
}

export async function upsertEdges(
  userId: string,
  nodeIds: string[],
  edgeType: GraphEdgeType = 'co_occurrence',
): Promise<GraphEdge[]> {
  await ensureGraphSchema();

  if (nodeIds.length < 2) {
    return [];
  }

  const db = getDbClient();
  const upserted: GraphEdge[] = [];

  for (let i = 0; i < nodeIds.length; i += 1) {
    for (let j = i + 1; j < nodeIds.length; j += 1) {
      const sourceId = nodeIds[i]!;
      const targetId = nodeIds[j]!;
      const [left, right] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];
      const id = `${left}:${right}:${edgeType}`;

      await db.execute({
        sql: `INSERT INTO graph_edges (
          id, user_id, source_id, target_id, edge_type, weight, created_at
        ) VALUES (?, ?, ?, ?, ?, 1.0, datetime('now'))
        ON CONFLICT(source_id, target_id, edge_type) DO UPDATE SET
          weight = weight + 1.0`,
        args: [id, userId, left, right, edgeType],
      });

      const result = await db.execute({
        sql: `SELECT * FROM graph_edges WHERE id = ?`,
        args: [id],
      });

      const row = result.rows[0];
      if (row) {
        upserted.push(mapEdgeRow(row as Record<string, unknown>));
      }
    }
  }

  return upserted;
}

export async function getGraph(filters: GraphQueryFilters): Promise<GraphSnapshot> {
  await ensureGraphSchema();

  const db = getDbClient();
  const conditions = ['user_id = ?'];
  const args: Array<string | number> = [filters.userId];

  if (filters.minScore !== undefined) {
    conditions.push('avg_score >= ?');
    args.push(filters.minScore);
  }

  if (filters.since) {
    conditions.push('last_seen >= ?');
    args.push(filters.since);
  }

  if (filters.nodeType) {
    conditions.push('node_type = ?');
    args.push(filters.nodeType);
  }

  const limit = filters.limit ?? 200;

  const nodeResult = await db.execute({
    sql: `SELECT * FROM graph_nodes
          WHERE ${conditions.join(' AND ')}
          ORDER BY last_seen DESC
          LIMIT ?`,
    args: [...args, limit],
  });

  const nodes = nodeResult.rows.map((row) =>
    mapNodeRow(row as Record<string, unknown>),
  );

  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodeIds = nodes.map((node) => node.id);
  const placeholders = nodeIds.map(() => '?').join(', ');

  const edgeResult = await db.execute({
    sql: `SELECT * FROM graph_edges
          WHERE user_id = ?
            AND source_id IN (${placeholders})
            AND target_id IN (${placeholders})`,
    args: [filters.userId, ...nodeIds, ...nodeIds],
  });

  return {
    nodes,
    edges: edgeResult.rows.map((row) => mapEdgeRow(row as Record<string, unknown>)),
  };
}

export async function getRecentNodeIds(
  userId: string,
  limit = 8,
): Promise<string[]> {
  await ensureGraphSchema();

  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT id FROM graph_nodes
          WHERE user_id = ?
          ORDER BY last_seen DESC
          LIMIT ?`,
    args: [userId, limit],
  });

  return result.rows.map((row) => String((row as Record<string, unknown>).id));
}

export async function recordFeedback(input: FeedbackRecordInput): Promise<void> {
  await ensureGraphSchema();

  const db = getDbClient();
  await db.execute({
    sql: `INSERT INTO feedback (
      id, user_id, message_id, thread_id, thumbs, rating, comment, score, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      input.id,
      input.userId,
      input.messageId,
      input.threadId,
      input.thumbs ?? null,
      input.rating ?? null,
      input.comment ?? null,
      input.score,
    ],
  });
}

export async function updateNodeScores(
  nodeIds: string[],
  score: number,
): Promise<void> {
  await ensureGraphSchema();

  if (nodeIds.length === 0) {
    return;
  }

  const db = getDbClient();

  for (const nodeId of nodeIds) {
    await db.execute({
      sql: `UPDATE graph_nodes
            SET avg_score = ROUND((avg_score + ?) / 2.0, 4)
            WHERE id = ?`,
      args: [score, nodeId],
    });
  }
}
