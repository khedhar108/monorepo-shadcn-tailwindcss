import { getDbClient } from './client';

const GRAPH_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS graph_nodes (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    label       TEXT NOT NULL,
    node_type   TEXT DEFAULT 'topic',
    frequency   INTEGER DEFAULT 1,
    avg_score   REAL DEFAULT 0.5,
    first_seen  TEXT DEFAULT (datetime('now')),
    last_seen   TEXT DEFAULT (datetime('now')),
    metadata    TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS graph_edges (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    source_id   TEXT NOT NULL REFERENCES graph_nodes(id),
    target_id   TEXT NOT NULL REFERENCES graph_nodes(id),
    edge_type   TEXT DEFAULT 'co_occurrence',
    weight      REAL DEFAULT 1.0,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(source_id, target_id, edge_type)
  )`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    message_id  TEXT NOT NULL,
    thread_id   TEXT NOT NULL,
    thumbs      TEXT CHECK (thumbs IN ('up', 'down')),
    rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    score       REAL NOT NULL DEFAULT 0.5,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS graph_node_messages (
    node_id     TEXT NOT NULL REFERENCES graph_nodes(id),
    message_id  TEXT NOT NULL,
    thread_id   TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (node_id, message_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_graph_nodes_user ON graph_nodes(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_graph_edges_user ON graph_edges(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id)`,
  `CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_feedback_thread ON feedback(thread_id)`,
] as const;

let schemaInitialized = false;

export async function ensureGraphSchema(): Promise<void> {
  if (schemaInitialized) {
    return;
  }

  const db = getDbClient();

  for (const statement of GRAPH_SCHEMA_STATEMENTS) {
    await db.execute(statement);
  }

  schemaInitialized = true;
}
