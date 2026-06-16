"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type GraphNode = {
  id: string;
  label: string;
  nodeType: string;
  frequency: number;
  avgScore: number;
  lastSeen: string;
  val?: number;
  color?: string;
};

export type GraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  weight: number;
  edgeType: string;
  source?: string;
  target?: string;
  value?: number;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: string;
};

export type GraphFilters = {
  minScore?: number;
  minFrequency?: number;
  since?: string;
  nodeType?: string;
  limit?: number;
};

export type UseKnowledgeGraphReturn = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: string;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  filters: GraphFilters;
  setFilters: (filters: GraphFilters) => void;
};

function mapNodesForForceGraph(nodes: GraphNode[]): GraphNode[] {
  return nodes.map((node) => ({
    ...node,
    val: Math.max(1, node.frequency),
  }));
}

function mapEdgesForForceGraph(edges: GraphEdge[]): GraphEdge[] {
  return edges.map((edge) => ({
    ...edge,
    source: edge.sourceId,
    target: edge.targetId,
    value: edge.weight,
  }));
}

/* ── Cache ──────────────────────────────────────────── */

const NOW = new Date().toISOString();
const CACHE_KEY_PREFIX = "aria:kg:";
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

type CachedGraph = {
  data: GraphData;
  storedAt: string;
};

function readCache(userId: string): GraphData | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedGraph;
    const age = Date.now() - new Date(parsed.storedAt).getTime();
    if (age > CACHE_MAX_AGE_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(userId: string, data: GraphData): void {
  try {
    const payload: CachedGraph = { data, storedAt: new Date().toISOString() };
    localStorage.setItem(`${CACHE_KEY_PREFIX}${userId}`, JSON.stringify(payload));
  } catch {
    // Storage may be unavailable.
  }
}

/* ── Minimal default demo ───────────────────────────── */

const DEFAULT_DEMO_NODES: GraphNode[] = [
  {
    id: "demo:aria", label: "ARIA", nodeType: "system",
    frequency: 10, avgScore: 0.88, lastSeen: NOW, color: "#22d3ee",
  },
  {
    id: "demo:memory", label: "Semantic Memory", nodeType: "feature",
    frequency: 5, avgScore: 0.82, lastSeen: NOW,
  },
  {
    id: "demo:feedback", label: "Feedback Loop", nodeType: "feature",
    frequency: 4, avgScore: 0.65, lastSeen: NOW,
  },
];

const DEFAULT_DEMO_EDGES: GraphEdge[] = [
  { id: "demo:e1", sourceId: "demo:aria", targetId: "demo:memory", weight: 3, edgeType: "co_occurrence" },
  { id: "demo:e2", sourceId: "demo:aria", targetId: "demo:feedback", weight: 3, edgeType: "co_occurrence" },
  { id: "demo:e3", sourceId: "demo:memory", targetId: "demo:feedback", weight: 2, edgeType: "co_occurrence" },
];

/* ── 50+ Node expanded demo graph ───────────────────── */

const TOPIC_LABELS = [
  "React", "Next.js", "TypeScript", "GraphQL", "Machine Learning",
  "Neural Networks", "Vector DBs", "PostgreSQL", "Docker", "Kubernetes",
  "CI/CD", "REST APIs", "WebSockets", "Auth", "Caching",
  "Rate Limiting", "Observability", "Testing", "Accessibility", "CSS-in-JS",
];

const ENTITY_LABELS = [
  "OpenAI", "Vercel", "Google Cloud", "AWS", "Supabase",
  "Prisma", "tRPC", "Tailwind CSS", "Radix UI", "shadcn/ui",
];

const CONCEPT_LABELS = [
  "Server Components", "Streaming", "Edge Computing", "Hydration",
  "Bundle Splitting", "Incremental Adoption", "Composability", "Middleware",
];

const PREFERENCE_LABELS = [
  "Concise answers", "Code examples", "Visual diagrams", "Performance focus",
  "Deep dives", "Pattern matching",
];

const FEATURE_LABELS = [
  "Knowledge Graph", "Semantic Memory", "Feedback Loop",
  "Working Memory", "Topic Extraction",
];

function makeNode(label: string, nodeType: string, freq: number, score: number): GraphNode {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `demo:${slug}`,
    label,
    nodeType,
    frequency: freq,
    avgScore: score,
    lastSeen: NOW,
  };
}

function makeEdge(sourceId: string, targetId: string, weight: number): GraphEdge {
  return {
    id: `demo:e:${sourceId}:${targetId}`,
    sourceId,
    targetId,
    weight,
    edgeType: "co_occurrence",
  };
}

function generateExpandedDemo(): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  // System hub
  nodes.push(makeNode("ARIA", "system", 30, 0.92));

  // Topics
  TOPIC_LABELS.forEach((label, i) => {
    nodes.push(makeNode(label, "topic", 12 - Math.floor(i / 4), 0.4 + Math.random() * 0.55));
  });

  // Entities
  ENTITY_LABELS.forEach((label, i) => {
    nodes.push(makeNode(label, "entity", 8 - Math.floor(i / 3), 0.45 + Math.random() * 0.5));
  });

  // Concepts
  CONCEPT_LABELS.forEach((label, i) => {
    nodes.push(makeNode(label, "concept", 6 - Math.floor(i / 4), 0.5 + Math.random() * 0.45));
  });

  // Preferences
  PREFERENCE_LABELS.forEach((label, i) => {
    nodes.push(makeNode(label, "preference", 4, 0.3 + Math.random() * 0.65));
  });

  // Features
  FEATURE_LABELS.forEach((label, i) => {
    nodes.push(makeNode(label, "feature", 7 - i, 0.55 + Math.random() * 0.4));
  });

  // Helper to add edges avoiding duplicates
  const addEdge = (s: string, t: string, w: number) => {
    const key = [s, t].sort().join(":");
    if (!edgeSet.has(key) && s !== t) {
      edgeSet.add(key);
      edges.push(makeEdge(s, t, w));
    }
  };

  // Connect hub to all nodes with varying weights
  const hubId = "demo:aria";
  nodes.forEach((n) => {
    if (n.id !== hubId) {
      addEdge(hubId, n.id, 2 + Math.floor(Math.random() * 5));
    }
  });

  // Connect topics to related entities and concepts
  for (let i = 0; i < TOPIC_LABELS.length; i++) {
    const topicNode = nodes[1 + i]!;
    // Each topic connects to 2-4 entities
    const entityStart = (i * 3) % ENTITY_LABELS.length;
    for (let j = 0; j < Math.min(3, ENTITY_LABELS.length); j++) {
      const entityNode = nodes[1 + TOPIC_LABELS.length + ((entityStart + j) % ENTITY_LABELS.length)]!;
      addEdge(topicNode.id, entityNode.id, 1 + Math.floor(Math.random() * 4));
    }
    // Each topic connects to 1-2 concepts
    const conceptStart = i % CONCEPT_LABELS.length;
    for (let j = 0; j < 2; j++) {
      const conceptNode = nodes[1 + TOPIC_LABELS.length + ENTITY_LABELS.length + ((conceptStart + j) % CONCEPT_LABELS.length)]!;
      addEdge(topicNode.id, conceptNode.id, 1 + Math.floor(Math.random() * 3));
    }
  }

  // Connect preferences to features and topics
  PREFERENCE_LABELS.forEach((_, pi) => {
    const prefNode = nodes[1 + TOPIC_LABELS.length + ENTITY_LABELS.length + CONCEPT_LABELS.length + pi]!;
    // Pref → 2 random features
    FEATURE_LABELS.forEach((_, fi) => {
      if (Math.random() > 0.5) {
        addEdge(prefNode.id, nodes[1 + TOPIC_LABELS.length + ENTITY_LABELS.length + CONCEPT_LABELS.length + PREFERENCE_LABELS.length + fi]!.id, 1 + Math.floor(Math.random() * 2));
      }
    });
  });

  // Connect features to topics
  FEATURE_LABELS.forEach((_, fi) => {
    const featNode = nodes[1 + TOPIC_LABELS.length + ENTITY_LABELS.length + CONCEPT_LABELS.length + PREFERENCE_LABELS.length + fi]!;
    for (let j = 0; j < 5; j++) {
      const ti = (fi * 3 + j) % TOPIC_LABELS.length;
      addEdge(featNode.id, nodes[1 + ti]!.id, 1 + Math.floor(Math.random() * 3));
    }
  });

  // Connect entities among themselves (related tech stack)
  for (let i = 0; i < ENTITY_LABELS.length; i++) {
    for (let j = i + 1; j < ENTITY_LABELS.length; j++) {
      if (Math.random() > 0.55) {
        addEdge(
          nodes[1 + TOPIC_LABELS.length + i]!.id,
          nodes[1 + TOPIC_LABELS.length + j]!.id,
          1 + Math.floor(Math.random() * 2),
        );
      }
    }
  }

  // Inter-topic connections (related themes)
  for (let i = 0; i < TOPIC_LABELS.length; i++) {
    for (let j = i + 1; j < TOPIC_LABELS.length; j++) {
      if (Math.abs(i - j) <= 3 && Math.random() > 0.4) {
        addEdge(nodes[1 + i]!.id, nodes[1 + j]!.id, 1 + Math.floor(Math.random() * 3));
      }
    }
  }

  return {
    nodes,
    edges,
    summary: `Demo: ${nodes.length} nodes, ${edges.length} connections. Toggle off to see your real graph.`,
  };
}

/* ── Hook ────────────────────────────────────────────── */

export function useKnowledgeGraph(
  userId: string | null,
  demoMode = false,
): UseKnowledgeGraphReturn {
  const [data, setData] = useState<GraphData>({
    nodes: [],
    edges: [],
    summary: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<GraphFilters>({
    minScore: 0.1,
    minFrequency: 1,
    limit: 200,
  });
  const [hasRealData, setHasRealData] = useState(false);

  const fetchGraph = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ userId });
      if (filters.minScore !== undefined)
        params.set("minScore", String(filters.minScore));
      if (filters.since) params.set("since", filters.since);
      if (filters.nodeType) params.set("nodeType", filters.nodeType);
      if (filters.limit) params.set("limit", String(filters.limit));

      const response = await fetch(`/api/graph?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: GraphData = await response.json();
      if (result.nodes.length > 0) {
        setHasRealData(true);
      }
      setData(result);
      writeCache(userId, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph");
      const cached = readCache(userId);
      if (cached) {
        setData(cached);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId, filters]);

  useEffect(() => {
    if (userId) {
      const cached = readCache(userId);
      if (cached) {
        setData(cached);
        if (cached.nodes.length > 0) {
          setHasRealData(true);
        }
      }
    }
    void fetchGraph();
  }, [fetchGraph, userId]);

  /* ── Demo mode OR real data ──────────────────────── */

  const showDefaultDemo = !hasRealData && data.nodes.length === 0 && !demoMode;

  const expandedDemo = useMemo(() => generateExpandedDemo(), []);

  const displayData = useMemo((): GraphData => {
    if (demoMode) return expandedDemo;
    if (showDefaultDemo) return { nodes: DEFAULT_DEMO_NODES, edges: DEFAULT_DEMO_EDGES, summary: "Preview: Start chatting to grow your own knowledge graph." };
    return data;
  }, [demoMode, showDefaultDemo, data, expandedDemo]);

  /* ── Client-side filters ─────────────────────────── */

  const filteredNodes = useMemo(() => {
    const minFreq = filters.minFrequency ?? 1;
    return displayData.nodes.filter((node) => node.frequency >= minFreq);
  }, [displayData.nodes, filters.minFrequency]);

  const filteredEdges = useMemo(() => {
    const nodeIdSet = new Set(filteredNodes.map((n) => n.id));
    return displayData.edges.filter(
      (edge) => nodeIdSet.has(edge.sourceId) && nodeIdSet.has(edge.targetId),
    );
  }, [displayData.edges, filteredNodes]);

  const nodes = mapNodesForForceGraph(filteredNodes);
  const edges = mapEdgesForForceGraph(filteredEdges);

  return {
    nodes,
    edges,
    summary: displayData.summary,
    isLoading,
    error,
    refetch: fetchGraph,
    filters,
    setFilters,
  };
}
