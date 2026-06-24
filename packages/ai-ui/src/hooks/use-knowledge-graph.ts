"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type GraphNode = {
  id: string;
  label: string;
  nodeType: string;
  graphKind?: string;
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
  graphKind?: 'all' | 'preference' | 'exploration';
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

/* ── 200-Node expanded demo graph ───────────────────── */

const TOPIC_LABELS = [
  "React", "Next.js", "TypeScript", "GraphQL", "Machine Learning",
  "Neural Networks", "Vector DBs", "PostgreSQL", "Docker", "Kubernetes",
  "CI/CD", "REST APIs", "WebSockets", "Auth", "Caching",
  "Rate Limiting", "Observability", "Testing", "Accessibility", "CSS-in-JS",
  "Node.js", "Deno", "Bun", "Python", "Rust",
  "Go", "Swift", "Kotlin", "Java", "C++",
  "WebAssembly", "Edge Functions", "Serverless", "Microservices", "Monorepos",
  "State Management", "Form Validation", "File Upload", "Search", "Pagination",
  "Internationalization", "Dark Mode", "Animations", "Data Visualization", "Charts",
  "Maps", "3D Graphics", "WebGL", "Canvas API", "SVG",
  "Audio Processing", "Video Streaming", "Image Optimization", "PDF Generation", "Email",
  "Push Notifications", "Service Workers", "PWA", "Mobile Dev", "React Native",
  "Flutter", "Electron", "Tauri", "CLI Tools", "Browser Extensions",
  "Web Scraping", "Automation", "Chatbots", "Voice Assistants", "NLP",
  "Computer Vision", "Reinforcement Learning", "GANs", "Transformers", "Fine-tuning",
  "RAG", "Embeddings", "Prompt Engineering", "AI Agents", "LangChain",
];

const ENTITY_LABELS = [
  "OpenAI", "Vercel", "Google Cloud", "AWS", "Supabase",
  "Prisma", "tRPC", "Tailwind CSS", "Radix UI", "shadcn/ui",
  "Anthropic", "Meta AI", "Hugging Face", "Cloudflare", "Netlify",
  "GitHub", "GitLab", "Stripe", "Twilio", "SendGrid",
  "Redis", "MongoDB", "Pinecone", "Weaviate", "Qdrant",
  "Turborepo", "Nx", "Vite", "Webpack", "esbuild",
  "Figma", "Framer", "Linear", "Notion", "Slack",
  "Datadog", "Sentry", "Grafana", "PlanetScale", "Neon",
  "Drizzle ORM", "Kysely", "Zod", "Vitest", "Playwright",
];

const CONCEPT_LABELS = [
  "Server Components", "Streaming", "Edge Computing", "Hydration",
  "Bundle Splitting", "Incremental Adoption", "Composability", "Middleware",
  "Event Sourcing", "CQRS", "Domain-Driven Design", "Clean Architecture",
  "Dependency Injection", "Inversion of Control", "Observer Pattern", "Pub/Sub",
  "Eventual Consistency", "CAP Theorem", "Idempotency", "Circuit Breaker",
  "Feature Flags", "A/B Testing", "Blue-Green Deploy", "Canary Release",
  "Zero Downtime", "Hot Module Replacement", "Tree Shaking", "Code Splitting",
  "Lazy Loading", "Prefetching", "Optimistic Updates", "Stale-While-Revalidate",
  "Content Negotiation", "Schema Validation", "Type Inference",
];

const PREFERENCE_LABELS = [
  "Concise answers", "Code examples", "Visual diagrams", "Performance focus",
  "Deep dives", "Pattern matching", "Step-by-step guides", "Best practices",
  "Real-world examples", "Comparison tables", "Architecture diagrams", "Benchmarks",
  "Quick summaries", "Detailed explanations", "Interactive demos", "Cheat sheets",
  "Video tutorials", "Code reviews", "Debugging tips", "Security focus",
  "Scalability patterns", "Cost optimization", "Developer experience", "Type safety",
  "Functional style",
];

const FEATURE_LABELS = [
  "Knowledge Graph", "Semantic Memory", "Feedback Loop",
  "Working Memory", "Topic Extraction", "Context Window", "Thread History",
  "Model Selection", "Guardrails", "Scoring", "Auto-tagging",
  "Export Data", "Collaboration", "Webhooks",
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
    nodes.push(makeNode(label, "topic", 10 - Math.floor(i / 8), 0.4 + Math.random() * 0.55));
  });

  // Entities
  ENTITY_LABELS.forEach((label, i) => {
    nodes.push(makeNode(label, "entity", 7 - Math.floor(i / 6), 0.45 + Math.random() * 0.5));
  });

  // Concepts
  CONCEPT_LABELS.forEach((label, i) => {
    nodes.push(makeNode(label, "concept", 5 - Math.floor(i / 7), 0.5 + Math.random() * 0.45));
  });

  // Preferences
  PREFERENCE_LABELS.forEach((_label, _i) => {
    nodes.push(makeNode(_label, "preference", 3 + Math.floor(Math.random() * 3), 0.3 + Math.random() * 0.65));
  });

  // Features
  FEATURE_LABELS.forEach((label, i) => {
    nodes.push(makeNode(label, "feature", 6 - Math.floor(i / 3), 0.55 + Math.random() * 0.4));
  });

  // Helper to add edges avoiding duplicates
  const addEdge = (s: string, t: string, w: number) => {
    const key = [s, t].sort().join(":");
    if (!edgeSet.has(key) && s !== t) {
      edgeSet.add(key);
      edges.push(makeEdge(s, t, w));
    }
  };

  // Index offsets for each group in the nodes array
  const topicStart = 1;
  const entityStart = topicStart + TOPIC_LABELS.length;
  const conceptStart = entityStart + ENTITY_LABELS.length;
  const prefStart = conceptStart + CONCEPT_LABELS.length;
  const featStart = prefStart + PREFERENCE_LABELS.length;

  // Connect hub to ~40% of nodes (sparse — avoids star-graph clutter)
  const hubId = "demo:aria";
  nodes.forEach((n) => {
    if (n.id !== hubId && Math.random() > 0.6) {
      addEdge(hubId, n.id, 2 + Math.floor(Math.random() * 4));
    }
  });

  // Connect topics to 2 entities and 1-2 concepts each
  for (let i = 0; i < TOPIC_LABELS.length; i++) {
    const topicNode = nodes[topicStart + i]!;
    // 2 entities
    for (let j = 0; j < 2; j++) {
      const ei = (i * 2 + j) % ENTITY_LABELS.length;
      addEdge(topicNode.id, nodes[entityStart + ei]!.id, 1 + Math.floor(Math.random() * 3));
    }
    // 1-2 concepts
    const conceptCount = 1 + (i % 2);
    for (let j = 0; j < conceptCount; j++) {
      const ci = (i + j) % CONCEPT_LABELS.length;
      addEdge(topicNode.id, nodes[conceptStart + ci]!.id, 1 + Math.floor(Math.random() * 2));
    }
  }

  // Connect preferences to 2-3 features each
  PREFERENCE_LABELS.forEach((_, pi) => {
    const prefNode = nodes[prefStart + pi]!;
    for (let fi = 0; fi < Math.min(3, FEATURE_LABELS.length); fi++) {
      const idx = (pi * 2 + fi) % FEATURE_LABELS.length;
      if (Math.random() > 0.35) {
        addEdge(prefNode.id, nodes[featStart + idx]!.id, 1 + Math.floor(Math.random() * 2));
      }
    }
  });

  // Connect features to 3-4 topics each
  FEATURE_LABELS.forEach((_, fi) => {
    const featNode = nodes[featStart + fi]!;
    for (let j = 0; j < 4; j++) {
      const ti = (fi * 5 + j) % TOPIC_LABELS.length;
      addEdge(featNode.id, nodes[topicStart + ti]!.id, 1 + Math.floor(Math.random() * 3));
    }
  });

  // Connect entities among themselves (sparser — 20% chance)
  for (let i = 0; i < ENTITY_LABELS.length; i++) {
    for (let j = i + 1; j < ENTITY_LABELS.length; j++) {
      if (Math.random() > 0.8) {
        addEdge(nodes[entityStart + i]!.id, nodes[entityStart + j]!.id, 1 + Math.floor(Math.random() * 2));
      }
    }
  }

  // Inter-topic connections (neighbors within ±2 indices, 30% chance)
  for (let i = 0; i < TOPIC_LABELS.length; i++) {
    for (let j = i + 1; j < TOPIC_LABELS.length; j++) {
      if (Math.abs(i - j) <= 2 && Math.random() > 0.7) {
        addEdge(nodes[topicStart + i]!.id, nodes[topicStart + j]!.id, 1 + Math.floor(Math.random() * 2));
      }
    }
  }

  // Cross-type: concepts ↔ entities (sparse links for cluster bridging)
  for (let i = 0; i < CONCEPT_LABELS.length; i++) {
    const ei = (i * 3) % ENTITY_LABELS.length;
    if (Math.random() > 0.5) {
      addEdge(nodes[conceptStart + i]!.id, nodes[entityStart + ei]!.id, 1);
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
  graphKind: 'all' | 'preference' | 'exploration' = 'all',
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
    graphKind,
    limit: 200,
  });
  const [hasRealData, setHasRealData] = useState(false);

  // Sync graphKind prop to filters when it changes
  useEffect(() => {
    setFilters((prev) => (prev.graphKind === graphKind ? prev : { ...prev, graphKind }));
  }, [graphKind]);

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
      if (filters.graphKind) params.set("graphKind", filters.graphKind);
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
