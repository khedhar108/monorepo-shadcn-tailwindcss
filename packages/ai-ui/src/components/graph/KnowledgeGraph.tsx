"use client";

import dynamic from "next/dynamic";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ForceGraphMethods,
  LinkObject,
  NodeObject,
} from "react-force-graph-2d";
import {
  type GraphEdge,
  type GraphNode,
  useKnowledgeGraph,
} from "../../hooks/use-knowledge-graph";
import {
  DEFAULT_PHYSICS,
  GraphControls,
  type GraphLayout,
  type PhysicsConfig,
} from "./GraphControls";
import { NodeDetail } from "./NodeDetail";

/* ── Dynamic import (SSR-safe) ─────────────────────────────── */

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((mod) => mod.default),
  { ssr: false },
) as unknown as typeof import("react-force-graph-2d").default;

/* ── Types ──────────────────────────────────────────────────── */

type ForceGraphNode = NodeObject<GraphNode>;
type ForceGraphEdge = LinkObject<GraphNode, GraphEdge>;
type ForceGraphRef = ForceGraphMethods<
  NodeObject<GraphNode>,
  LinkObject<GraphNode, GraphEdge>
>;

export type KnowledgeGraphProps = {
  userId: string | null;
  className?: string;
  onNodeClick?: (node: GraphNode) => void;
  highlightedNodeIds?: Set<string>;
  pulseNodeIds?: Set<string>;
  demoMode?: boolean;
  onDemoModeChange?: (enabled: boolean) => void;
};

type GraphKindTab = "all" | "exploration" | "preference";

/* ── Light-theme design tokens ──────────────────────────────── */

const BG_WHITE = "#FFFFFF";
const NODE_MIN_RADIUS = 3;
const NODE_MAX_RADIUS = 8;
const PULSE_DURATION_MS = 1800;
const ACCENT_TEAL = "#0D9488";

type NodeColorMap = Record<string, string>;
const NODE_TYPE_COLORS: NodeColorMap = {
  system: "#0D9488",     // teal  — ARIA hub
  topic: "#7C3AED",      // purple
  entity: "#059669",     // emerald
  concept: "#2563EB",    // blue
  preference: "#D97706", // amber
  feature: "#DB2777",    // pink
};
const NODE_DEFAULT_COLOR = "#6B7280";

function getNodeTypeColor(nodeType: string): string {
  return NODE_TYPE_COLORS[nodeType] ?? NODE_DEFAULT_COLOR;
}

function getScoreColor(avgScore: number): string {
  if (avgScore >= 0.7) return "#059669"; // emerald — high confidence
  if (avgScore >= 0.4) return "#D97706"; // amber — medium
  return "#DC2626"; // red — low / needs adjustment
}

function getNodeColor(node: GraphNode): string {
  if (node.color) return node.color;
  if (node.graphKind === "preference" || node.nodeType === "preference") {
    return getScoreColor(node.avgScore);
  }
  return getNodeTypeColor(node.nodeType);
}

/* ── Helpers ────────────────────────────────────────────────── */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function getNodeRadius(freq: number, sizeMultiplier: number): number {
  const base = 2.5 * sizeMultiplier * (1 + Math.log2(freq + 1) * 0.8);
  return Math.max(NODE_MIN_RADIUS, Math.min(NODE_MAX_RADIUS, base));
}

function getLinkWidth(weight: number): number {
  return Math.min(2.0, 0.3 + Math.log(weight + 1) * 0.28);
}

function getEndpointId(endpoint: unknown): string | null {
  if (endpoint == null) return null;
  if (typeof endpoint === "object" && "id" in endpoint) {
    const id = (endpoint as { id?: string | number }).id;
    return id === undefined ? null : String(id);
  }
  return String(endpoint);
}

/* ── Spatial-grid collision force ──────────────────────────── */
/*
 * Replaces the previous O(n²) brute-force approach with a grid-bucketed
 * neighbor check.  For 200 nodes at CELL_SIZE 40, this typically checks
 * ~600 pairs instead of 40 000.
 */
function createCollideForce(
  radiusFn: (node: ForceGraphNode) => number,
  strength = 0.7,
  iterations = 1,
) {
  let nodes: ForceGraphNode[] = [];
  const CELL_SIZE = 40;

  function force() {
    if (nodes.length < 2) return;

    for (let iter = 0; iter < iterations; iter++) {
      /* 1. Bucket every node into a grid cell */
      const grid = new Map<string, ForceGraphNode[]>();
      for (const node of nodes) {
        const cx = Math.floor((node.x ?? 0) / CELL_SIZE);
        const cy = Math.floor((node.y ?? 0) / CELL_SIZE);
        const key = `${cx},${cy}`;
        let cell = grid.get(key);
        if (!cell) { cell = []; grid.set(key, cell); }
        cell.push(node);
      }

      /* 2. For each cell, check pairs within the 3×3 neighborhood */
      for (const [key, cell] of grid) {
        const parts = key.split(",");
        const cx = Number(parts[0]);
        const cy = Number(parts[1]);

        for (let dx = 0; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy < 0) continue; // avoid duplicate pair checks
            const nKey = `${cx + dx},${cy + dy}`;
            const neighbor = dx === 0 && dy === 0 ? cell : grid.get(nKey);
            if (!neighbor) continue;

            for (let i = 0; i < cell.length; i++) {
              const jStart = dx === 0 && dy === 0 ? i + 1 : 0;
              for (let j = jStart; j < neighbor.length; j++) {
                const a = cell[i]!;
                const b = neighbor[j]!;
                const ddx = (b.x ?? 0) - (a.x ?? 0);
                const ddy = (b.y ?? 0) - (a.y ?? 0);
                const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                const minDist = radiusFn(a) + radiusFn(b);
                if (dist < minDist) {
                  const overlap = ((minDist - dist) / dist) * strength * 0.5;
                  const mx = ddx * overlap;
                  const my = ddy * overlap;
                  if (b.vx !== undefined) b.vx += mx;
                  if (b.vy !== undefined) b.vy += my;
                  if (a.vx !== undefined) a.vx -= mx;
                  if (a.vy !== undefined) a.vy -= my;
                }
              }
            }
          }
        }
      }
    }
  }

  force.initialize = (n: ForceGraphNode[]) => {
    nodes = n;
  };

  return force;
}

/* ── BFS level computation — for progressive entrance reveal ── */

function computeBfsLevels(hubId: string, edges: GraphEdge[]): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.sourceId)) adj.set(e.sourceId, []);
    if (!adj.has(e.targetId)) adj.set(e.targetId, []);
    adj.get(e.sourceId)!.push(e.targetId);
    adj.get(e.targetId)!.push(e.sourceId);
  }
  const levels = new Map<string, number>();
  levels.set(hubId, 0);
  const queue: string[] = [hubId];
  while (queue.length) {
    const cur = queue.shift()!;
    const curLevel = levels.get(cur)!;
    for (const next of adj.get(cur) ?? []) {
      if (!levels.has(next)) {
        levels.set(next, curLevel + 1);
        queue.push(next);
      }
    }
  }
  return levels;
}

/* ── Sub-hub selection — highest-frequency node per type ─────── */

function pickSubHubs(nodes: GraphNode[], hubId: string): Map<string, string> {
  const best = new Map<string, { id: string; freq: number }>();
  for (const n of nodes) {
    if (n.id === hubId || n.nodeType === "system") continue;
    const cur = best.get(n.nodeType);
    if (!cur || (n.frequency ?? 0) > cur.freq) {
      best.set(n.nodeType, { id: n.id, freq: n.frequency ?? 0 });
    }
  }
  return new Map([...best.entries()].map(([t, v]) => [t, v.id]));
}

type ClusterConfig = {
  hubId: string;
  subHubIds: Set<string>;
  subHubTargets: Map<string, { x: number; y: number }>;
  nodeToHubId: Map<string, string>;
  nodeOffset: Map<string, { angle: number; radius: number }>;
  strengths: { hub: number; subHub: number; member: number };
};

/* ── Cluster force — ARIA pinned at center, sub-hubs on a ring,
 *   members orbit their category sub-hub (multi-center "galaxy"). ─ */

function createClusterForce(configRef: { current: ClusterConfig }) {
  let nodes: ForceGraphNode[] = [];

  function force() {
    const cfg = configRef.current;
    if (nodes.length < 2) return;

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    for (const node of nodes) {
      if (node.x === undefined || node.y === undefined) continue;

      if (node.id === cfg.hubId) {
        if (node.vx !== undefined) node.vx += (0 - node.x) * cfg.strengths.hub;
        if (node.vy !== undefined) node.vy += (0 - node.y) * cfg.strengths.hub;
        continue;
      }

      if (cfg.subHubIds.has(node.id)) {
        const target = cfg.subHubTargets.get(node.id);
        if (target) {
          if (node.vx !== undefined) node.vx += (target.x - node.x) * cfg.strengths.subHub;
          if (node.vy !== undefined) node.vy += (target.y - node.y) * cfg.strengths.subHub;
        }
        continue;
      }

      const myHubId = cfg.nodeToHubId.get(node.id);
      if (!myHubId) continue;
      const myHub = nodeMap.get(myHubId);
      if (!myHub || myHub.x === undefined || myHub.y === undefined) continue;
      const offset = cfg.nodeOffset.get(node.id);
      if (!offset) continue;

      const targetX = myHub.x + offset.radius * Math.cos(offset.angle);
      const targetY = myHub.y + offset.radius * Math.sin(offset.angle);

      if (node.vx !== undefined) node.vx += (targetX - node.x) * cfg.strengths.member;
      if (node.vy !== undefined) node.vy += (targetY - node.y) * cfg.strengths.member;
    }
  }

  force.initialize = (n: ForceGraphNode[]) => {
    nodes = n;
  };

  return force;
}

/* ── Visual position helper — floating + breathing, paused on dragged node ── */

function getNodeVisualPos(
  node: ForceGraphNode,
  draggingId: string | null,
  now: number,
): { x: number; y: number; breathScale: number } {
  const isDragging = node.id === draggingId;
  const phaseOffset = node.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const floatX = isDragging ? 0 : Math.sin(now * 0.0006 + phaseOffset) * 1.2;
  const floatY = isDragging ? 0 : Math.cos(now * 0.0008 + phaseOffset * 1.3) * 1.2;
  const breathScale = isDragging ? 1 : 1 + 0.04 * Math.sin(now * 0.0018 + phaseOffset);
  return {
    x: ((node.x as number) || 0) + floatX,
    y: ((node.y as number) || 0) + floatY,
    breathScale,
  };
}

/* ── Partial quadratic bezier — for edge "draw-on" entrance ──── */

function drawPartialQuadBezier(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  mx: number, my: number,
  tx: number, ty: number,
  fraction: number,
) {
  if (fraction >= 1) {
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, my, tx, ty);
    return;
  }
  if (fraction <= 0) return;
  const steps = 12;
  ctx.moveTo(sx, sy);
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * fraction;
    const t1 = 1 - t;
    const x = t1 * t1 * sx + 2 * t1 * t * mx + t * t * tx;
    const y = t1 * t1 * sy + 2 * t1 * t * my + t * t * ty;
    ctx.lineTo(x, y);
  }
}

/* ── Component ──────────────────────────────────────────────── */

export function KnowledgeGraph({
  userId,
  className = "",
  onNodeClick,
  highlightedNodeIds,
  pulseNodeIds: externalPulseNodeIds,
  demoMode = false,
  onDemoModeChange,
}: KnowledgeGraphProps) {
  const [graphKindTab, setGraphKindTab] = useState<GraphKindTab>("all");
  /* Always fetch the full graph; Explore/Prefs/Both filter client-side so
     tab switches are instant and don't race a network refetch. */
  const { nodes, edges, summary, isLoading, filters, setFilters } =
    useKnowledgeGraph(userId, demoMode);

  const graphRef = useRef<ForceGraphRef | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousNodeIdsRef = useRef<Set<string>>(new Set());
  const hasAutoFittedRef = useRef(false);
  const physicsConfigRef = useRef<PhysicsConfig>(DEFAULT_PHYSICS);
  const collideInstalledRef = useRef(false);

  /*
   * CRITICAL: hover state lives in a ref, NOT useState.
   * This prevents React re-renders on every mouse move, which was the
   * primary cause of the shimmer / flicker.  The canvas reads the ref
   * directly during each draw frame.
   */
  const hoveredNodeIdRef = useRef<string | null>(null);

  /*
   * Dragged-node tracking. While a node is being dragged, its floating
   * and breathing animations are frozen so it tracks the cursor exactly.
   */
  const draggingNodeIdRef = useRef<string | null>(null);

  /*
   * Cluster layout config + BFS entrance levels. Stored in refs and read
   * inside the d3 force + canvas draw callbacks, so updating them when the
   * graph data changes does NOT require re-installing the force.
   */
  const clusterConfigRef = useRef<ClusterConfig>({
    hubId: "demo:aria",
    subHubIds: new Set(),
    subHubTargets: new Map(),
    nodeToHubId: new Map(),
    nodeOffset: new Map(),
    strengths: { hub: 0.35, subHub: 0.08, member: 0.018 },
  });
  const nodeLevelsRef = useRef<Map<string, number>>(new Map());

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pulseNodeIds, setPulseNodeIds] = useState<Set<string>>(new Set());
  const [physicsConfig, setPhysicsConfig] = useState<PhysicsConfig>(DEFAULT_PHYSICS);

  physicsConfigRef.current = physicsConfig;

  /* ── Staggered entrance & breathing animation refs and logic ── */
  const animationStartTimeRef = useRef(Date.now());

  useEffect(() => {
    animationStartTimeRef.current = Date.now();
  }, [nodes]);

  /* ── Compute sub-hubs, cluster targets, and BFS entrance levels ── */
  useEffect(() => {
    const hubNode = nodes.find(
      (n) => n.nodeType === "system" || n.id.endsWith(":user-hub") || n.id === "demo:aria",
    );
    const hubId = hubNode?.id ?? "demo:aria";

    const subHubByType = pickSubHubs(nodes, hubId);
    const subHubIds = new Set(subHubByType.values());

    /* Count members per sub-hub so we can scale the orbit spread. */
    const memberCounts = new Map<string, number>();
    for (const n of nodes) {
      if (n.id === hubId || subHubIds.has(n.id)) continue;
      const myHub = subHubByType.get(n.nodeType);
      if (!myHub) continue;
      memberCounts.set(myHub, (memberCounts.get(myHub) ?? 0) + 1);
    }

    /*
     * Distribute members on a spiral around their sub-hub: even angular
     * spacing + multi-ring radii that scale with cluster size.  This keeps
     * a 79-member topic cluster from collapsing onto a single tight ring.
     */
    const nodeToHubId = new Map<string, string>();
    const nodeOffset = new Map<string, { angle: number; radius: number }>();
    const memberIndex = new Map<string, number>();
    for (const n of nodes) {
      if (n.id === hubId || subHubIds.has(n.id)) continue;
      const myHub = subHubByType.get(n.nodeType);
      if (!myHub) continue;

      const idx = memberIndex.get(myHub) ?? 0;
      memberIndex.set(myHub, idx + 1);
      const count = memberCounts.get(myHub) ?? 1;

      nodeToHubId.set(n.id, myHub);
      const angle = (idx / count) * 2 * Math.PI;
      const baseRing = 26;
      const ringSpacing = 16;
      const nodesPerRing = Math.max(8, Math.floor((2 * Math.PI * baseRing) / 14));
      const ring = Math.floor(idx / nodesPerRing);
      const radius = baseRing + ring * ringSpacing;
      nodeOffset.set(n.id, { angle, radius });
    }

    const el = containerRef.current;
    const minDim = Math.min(
      el?.clientWidth ?? dimensions.width,
      el?.clientHeight ?? dimensions.height,
    );
    /* Give clusters more room at scale: more sub-hubs / bigger clusters
     * need a wider inner ring so they don't collide with each other.
     * ponytail: floor scales down for narrow viewports (<300px sidebar) so
     * nodes don't spread to the edges and clip their labels. */
    const innerRadius = Math.max(minDim < 300 ? 60 : 110, minDim * 0.28);
    const types = [...subHubByType.keys()];
    const subHubTargets = new Map<string, { x: number; y: number }>();
    types.forEach((t, i) => {
      const id = subHubByType.get(t)!;
      const angle = (i / types.length) * 2 * Math.PI - Math.PI / 2;
      subHubTargets.set(id, {
        x: innerRadius * Math.cos(angle),
        y: innerRadius * Math.sin(angle),
      });
    });

    clusterConfigRef.current = {
      hubId,
      subHubIds,
      subHubTargets,
      nodeToHubId,
      nodeOffset,
      strengths: { hub: 0.35, subHub: 0.06, member: 0.012 },
    };

    nodeLevelsRef.current = computeBfsLevels(hubId, edges);
  }, [nodes, edges, dimensions]);

  const getEntranceScale = useCallback((node: ForceGraphNode) => {
    // BFS level from the ARIA hub: 0 = hub, 1 = direct neighbors, 2 = next ring, ...
    // Nodes appear level-by-level for an Obsidian-style progressive reveal.
    const level = nodeLevelsRef.current.get(node.id) ?? 1;
    const levelDelay = 180;
    const entranceDuration = 450;
    const delay = Math.min(level * levelDelay, 1400);
    const elapsed = Date.now() - animationStartTimeRef.current - delay;

    if (elapsed < 0) return 0;
    if (elapsed >= entranceDuration) return 1;
    const t = elapsed / entranceDuration;
    // Elastic overshoot entrance animation
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }, []);

  /* ── ResizeObserver — responsive canvas dimensions ──── */
  /*
   * Instead of hardcoded width={800} height={600}, we measure the
   * container element and pass its exact pixel dimensions to
   * ForceGraph2D.  This fixes:
   *   - Graph not centered (was always 800×600 regardless of container)
   *   - Expand overlay showing at 50% size
   *   - Sidebar graph overflowing / underflowing
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setDimensions({
          width: Math.floor(width),
          height: Math.floor(height),
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* ── New-node pulse animation ────────────────────────── */

  useEffect(() => {
    const currentIds = new Set(nodes.map((n) => n.id));
    const newIds = [...currentIds].filter(
      (id) => !previousNodeIdsRef.current.has(id),
    );
    previousNodeIdsRef.current = currentIds;

    if (newIds.length === 0) return;

    setPulseNodeIds((prev) => {
      const next = new Set(prev);
      newIds.forEach((id) => next.add(id));
      return next;
    });

    const timeoutId = window.setTimeout(() => {
      setPulseNodeIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.delete(id));
        return next;
      });
    }, PULSE_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [nodes]);

  const combinedPulseIds = useMemo(() => {
    const combined = new Set(pulseNodeIds);
    externalPulseNodeIds?.forEach((id) => combined.add(id));
    return combined;
  }, [pulseNodeIds, externalPulseNodeIds]);

  /* ── Search: highlight mode (nodes dim, not filtered out) ── */

  const searchMatchIds = useMemo((): Set<string> | null => {
    if (!searchQuery) return null;
    const q = searchQuery.toLowerCase();
    return new Set(
      nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id),
    );
  }, [nodes, searchQuery]);

  /* Filter by active tab client-side so Explore/Prefs/Both visibly change the
     graph. System hubs stay visible on every tab. Missing graphKind is treated
     as exploration (legacy/demo nodes). Search still only highlights. */
  const filteredNodes = useMemo(() => {
    if (graphKindTab === "all") return nodes;
    return nodes.filter((n) => {
      if (n.nodeType === "system") return true;
      if (graphKindTab === "preference") {
        return n.graphKind === "preference" || n.nodeType === "preference";
      }
      // exploration
      return (
        n.nodeType !== "preference" &&
        (n.graphKind === "exploration" || n.graphKind == null)
      );
    });
  }, [nodes, graphKindTab]);

  const filteredEdges = useMemo(() => {
    const idSet = new Set(filteredNodes.map((n) => n.id));
    return edges.filter((e) => idSet.has(e.sourceId) && idSet.has(e.targetId));
  }, [edges, filteredNodes]);

  const nodeTypes = useMemo(() => {
    const types = new Set(nodes.map((n) => n.nodeType));
    return Array.from(types);
  }, [nodes]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [selectedNodeId, nodes]);

  const relatedNodeLabels = useMemo(() => {
    if (!selectedNodeId) return [];
    const connected = edges
      .filter((e) => e.sourceId === selectedNodeId || e.targetId === selectedNodeId)
      .map((e) => (e.sourceId === selectedNodeId ? e.targetId : e.sourceId));
    return nodes
      .filter((n) => connected.includes(n.id))
      .map((n) => n.label)
      .slice(0, 8);
  }, [selectedNodeId, edges, nodes]);

  /* ── Neighbor lookup ─────────────────────────────────── */

  const neighborIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!map.has(e.sourceId)) map.set(e.sourceId, new Set());
      if (!map.has(e.targetId)) map.set(e.targetId, new Set());
      map.get(e.sourceId)!.add(e.targetId);
      map.get(e.targetId)!.add(e.sourceId);
    }
    return map;
  }, [edges]);

  /* ── Interaction handlers ─────────────────────────────── */

  const handleNodeClick = useCallback(
    (node: ForceGraphNode) => {
      setSelectedNodeId(node.id);
      onNodeClick?.(node);
      if (node.x != null && node.y != null) {
        graphRef.current?.centerAt(node.x, node.y, 400);
      }
    },
    [onNodeClick],
  );

  /*
   * Hover handler: updates a ref only.  Zero React re-renders.
   * The canvas drawing functions read hoveredNodeIdRef.current
   * directly during each frame, so the visual update is instant.
   */
  const handleNodeHover = useCallback(
    (node: ForceGraphNode | null) => {
      hoveredNodeIdRef.current = node?.id ?? null;
    },
    [],
  );

  /*
   * Drag tracking: freeze the dragged node's float/breathing so it stays
   * exactly under the cursor. react-force-graph-2d has no onNodeDragStart,
   * so we set the ref on the first onNodeDrag frame and clear it on end.
   */
  const handleNodeDrag = useCallback((node: ForceGraphNode) => {
    draggingNodeIdRef.current = node.id;
  }, []);
  const handleNodeDragEnd = useCallback(() => {
    draggingNodeIdRef.current = null;
  }, []);

  const handleBackgroundClick = useCallback(
    () => setSelectedNodeId(null),
    [],
  );

  /* ── Physics + collision force ────────────────────────── */

  const applyPhysics = useCallback((cfg: PhysicsConfig): boolean => {
    const g = graphRef.current;
    if (!g) return false;
    (g.d3Force("link") as { distance?: (d: number) => unknown } | undefined)?.distance?.(cfg.linkDistance);
    (g.d3Force("charge") as { strength?: (s: number) => unknown } | undefined)?.strength?.(-cfg.repulsion);
    (g.d3Force("charge") as { distanceMax?: (d: number) => unknown } | undefined)?.distanceMax?.(250);
    return true;
  }, []);

  /* Install collision + cluster forces once on mount */
  useEffect(() => {
    const t = window.setTimeout(() => {
      const g = graphRef.current;
      if (!g) return;

      applyPhysics(physicsConfigRef.current);

      if (!collideInstalledRef.current) {
        collideInstalledRef.current = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (g as any).d3Force(
          "collide",
          createCollideForce(
            (node: ForceGraphNode) =>
              getNodeRadius(node.frequency ?? 1, physicsConfigRef.current.nodeSize) + 6,
          ),
        );
        // Cluster force: ARIA pinned at center, category sub-hubs on a ring,
        // members orbit their sub-hub → multi-center "galaxy" layout.
        // Reads clusterConfigRef.current each tick, so it adapts when nodes change.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (g as any).d3Force("cluster", createClusterForce(clusterConfigRef));
      }
    }, 100);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Apply physics on config change */
  useEffect(() => {
    if (!applyPhysics(physicsConfig)) return;
    hasAutoFittedRef.current = false;
    graphRef.current?.d3ReheatSimulation();
  }, [physicsConfig, applyPhysics]);

  /* ── Auto-fit after simulation settles ────────────────── */

  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;

  const handleEngineStop = useCallback(() => {
    if (hasAutoFittedRef.current) return;
    hasAutoFittedRef.current = true;
    // ponytail: smaller padding on narrow viewports so the graph fills more
    // of the available space instead of being squeezed into the center.
    const pad = dimensionsRef.current.width < 300 ? 16 : 40;
    graphRef.current?.zoomToFit(500, pad);
  }, []);

  /* ── Re-fit when container resizes significantly ──────── */

  const prevDimensionsRef = useRef(dimensions);
  useEffect(() => {
    const prev = prevDimensionsRef.current;
    prevDimensionsRef.current = dimensions;
    /* Only re-fit if the size change is large (>80px in either axis) */
    if (
      Math.abs(dimensions.width - prev.width) > 80 ||
      Math.abs(dimensions.height - prev.height) > 80
    ) {
      const pad = dimensions.width < 300 ? 16 : 40;
      const t = window.setTimeout(() => {
        graphRef.current?.zoomToFit(400, pad);
      }, 200);
      return () => window.clearTimeout(t);
    }
  }, [dimensions]);

  /* ── Canvas: background ───────────────────────────────── */

  const onRenderFramePre = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;

      ctx.fillStyle = BG_WHITE;
      ctx.fillRect(0, 0, w, h);

      const grad = ctx.createRadialGradient(
        w / 2, h / 2, 0,
        w / 2, h / 2, Math.max(w, h) * 0.5,
      );
      grad.addColorStop(0, "rgba(13, 148, 136, 0.025)");
      grad.addColorStop(0.4, "rgba(13, 148, 136, 0.008)");
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
    [],
  );

  /* ── Canvas: node rendering ───────────────────────────── */
  /*
   * IMPORTANT: this callback reads hoveredNodeIdRef.current directly,
   * NOT from a React state variable.  This means the callback identity
   * is stable (doesn't change on hover) and no React re-render occurs.
   * ForceGraph2D's own pointer-interaction system triggers the canvas
   * redraw when the mouse moves, and this function picks up the new
   * hover target via the ref.
   */

  const nodeCanvasObject = useCallback(
    (
      node: ForceGraphNode,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      const freq = node.frequency;
      const baseR = getNodeRadius(freq, physicsConfigRef.current.nodeSize);
      const pulsing = combinedPulseIds.has(node.id);
      const radius = pulsing ? baseR * 1.2 : baseR;
      const typeColor = getNodeColor(node);
      const color = node.color ?? typeColor;
      const isAriaHub = node.id === "demo:aria" || node.nodeType === "system" || node.id.endsWith(":user-hub");

      /* Read hover from ref — no re-render */
      const hoveredId = hoveredNodeIdRef.current;
      const isSelected = node.id === selectedNodeId;
      const isHovered = node.id === hoveredId;
      const isConnectedSelected = selectedNodeId
        ? (neighborIds.get(node.id)?.has(selectedNodeId) ?? false)
        : false;
      const isConnectedHovered = hoveredId
        ? (neighborIds.get(node.id)?.has(hoveredId) ?? false)
        : false;

      /* Search highlight */
      const isSearchMatch = searchMatchIds ? searchMatchIds.has(node.id) : true;

      let opacity = 1;
      let scale = 1;

      if (searchMatchIds) {
        /* Search mode: highlight matches, heavily dim non-matches */
        if (isSearchMatch) { opacity = 1; scale = 1.2; }
        else { opacity = 0.1; scale = 0.65; }
      } else if (selectedNodeId) {
        if (isSelected) { opacity = 1; scale = 1.6; }
        else if (isConnectedSelected) { opacity = 1; scale = 1.2; }
        else { opacity = 0.15; scale = 0.7; }
      } else if (hoveredId) {
        if (isHovered) { opacity = 1; scale = 1.3; }
        else if (isConnectedHovered) { opacity = 1; scale = 1.1; }
        else { opacity = 0.2; scale = 0.75; }
      }

      // BFS-level entrance scale (progressive reveal from the hub outward)
      const entranceScale = getEntranceScale(node);
      if (entranceScale <= 0) return;

      // Floating/breathing — paused on the node currently being dragged
      const pos = getNodeVisualPos(node, draggingNodeIdRef.current, Date.now());
      const x = pos.x;
      const y = pos.y;
      const breathScale = pos.breathScale;

      const isSubHub = clusterConfigRef.current.subHubIds.has(node.id);
      const subHubBoost = isSubHub ? 1.15 : 1;

      const drawR = radius * scale * entranceScale * breathScale * subHubBoost;
      ctx.globalAlpha = opacity * entranceScale;

      /* Selection / pulse / hub / sub-hub glow ring */
      if (isSelected || pulsing || isAriaHub || isSubHub) {
        const glowR = drawR * (pulsing ? 2.4 : isSelected ? 2.0 : isAriaHub ? 1.6 : 1.35);
        const { r, g, b } = hexToRgb(isSelected ? ACCENT_TEAL : color);
        const glow = ctx.createRadialGradient(x, y, drawR * 0.6, x, y, glowR);
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${pulsing ? 0.25 : isAriaHub ? 0.15 : 0.08})`);
        glow.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.03)`);
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Flat filled circle */
      ctx.beginPath();
      ctx.arc(x, y, drawR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      /* Subtle border (0.5px, 35% opacity of node color) */
      const { r: cr, g: cg, b: cb } = hexToRgb(color);
      ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.35)`;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      /* Selection / hub / sub-hub ring */
      if (isSelected) {
        ctx.strokeStyle = ACCENT_TEAL;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (isAriaHub) {
        ctx.strokeStyle = `${color}60`;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (isSubHub) {
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.5)`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      /* Zoom-responsive label rendering (Obsidian-style).
       * Hover/selection now ALSO reveals labels of every connected neighbor. */
      const isHighFreq = (node.frequency ?? 0) >= 3;
      const isFocused = isHovered || isSelected;
      const isConnectedFocused = isConnectedHovered || isConnectedSelected;
      const shouldShowLabel =
        isFocused ||
        isConnectedFocused ||
        (globalScale > 1.1 && (isHighFreq || isAriaHub)) ||
        (globalScale > 1.8);

      if (shouldShowLabel && entranceScale > 0.2) {
        const scaleFactor = 1 / globalScale;
        const fontSize = Math.max(5, Math.min(14, 10.5 * scaleFactor));
        ctx.font = `500 ${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const label = node.label;
        const textY = y + drawR + 5 * scaleFactor;
        const tw = ctx.measureText(label).width;
        const dotR = 2.5 * scaleFactor;
        const padX = 7 * scaleFactor;
        const padY = 4 * scaleFactor;
        const totalW = dotR * 2 + 3 * scaleFactor + tw + padX * 2;
        const ph = fontSize + padY * 2;
        const px = x - totalW / 2;
        const py = textY - padY;

        // Focused node label at full strength; connected-neighbor labels slightly dimmed.
        const labelAlpha = isFocused ? 0.92 : 0.72;

        /* White pill with subtle border */
        ctx.globalAlpha = opacity * labelAlpha * entranceScale;
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.roundRect(px, py, totalW, ph, 5 * scaleFactor);
        ctx.fill();
        ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
        ctx.lineWidth = 0.5 * scaleFactor;
        ctx.stroke();

        /* Node type color dot */
        const dotX = px + padX + dotR;
        const dotY = py + ph / 2;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        /* Label text */
        ctx.fillStyle = "#1A1A1A";
        ctx.fillText(label, x + dotR + 1.5 * scaleFactor, textY);
      }

      ctx.globalAlpha = 1;
    },
    [combinedPulseIds, neighborIds, selectedNodeId, searchMatchIds, getEntranceScale],
  );

  /* ── Hit area ─────────────────────────────────────────── */

  const nodePointerAreaPaint = useCallback(
    (node: ForceGraphNode, color: string, ctx: CanvasRenderingContext2D) => {
      const r = getNodeRadius(node.frequency ?? 1, physicsConfigRef.current.nodeSize);
      const pos = getNodeVisualPos(node, draggingNodeIdRef.current, Date.now());

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(
        pos.x,
        pos.y,
        r * 1.5 + 4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    },
    [],
  );

  /* ── Canvas: curved link + directional arrow ──────────── */

  const linkCanvasObject = useCallback(
    (link: ForceGraphEdge, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const sid = getEndpointId(link.source) ?? link.sourceId;
      const tid = getEndpointId(link.target) ?? link.targetId;
      if (!sid || !tid) return;

      const sourceObj = typeof link.source === "object" && link.source !== null ? link.source as ForceGraphNode : null;
      const targetObj = typeof link.target === "object" && link.target !== null ? link.target as ForceGraphNode : null;

      // Per-endpoint visual position; floating pauses for whichever endpoint is being dragged.
      const now = Date.now();
      const dragId = draggingNodeIdRef.current;
      const sPos = sourceObj ? getNodeVisualPos(sourceObj, dragId, now) : { x: 0, y: 0 };
      const tPos = targetObj ? getNodeVisualPos(targetObj, dragId, now) : { x: 0, y: 0 };
      const sx = sPos.x;
      const sy = sPos.y;
      const tx = tPos.x;
      const ty = tPos.y;
      const w = (link.value as number) || 1;
      const width = getLinkWidth(w);

      /* Read hover from ref — no re-render */
      const hoveredId = hoveredNodeIdRef.current;

      const connSel = selectedNodeId
        ? sid === selectedNodeId || tid === selectedNodeId
        : false;
      const connHov = hoveredId
        ? sid === hoveredId || tid === hoveredId
        : false;

      // BFS-level entrance: edge "draws on" as the deeper endpoint appears.
      const sEntrance = sourceObj ? getEntranceScale(sourceObj) : 1;
      const tEntrance = targetObj ? getEntranceScale(targetObj) : 1;
      const linkEntrance = Math.min(sEntrance, tEntrance);
      if (linkEntrance <= 0) return;

      let opacity = (0.12 + Math.min(0.2, w * 0.02)) * linkEntrance;
      let colorBase = "180,185,195"; // light gray for white bg
      let lineWidth = width;
      let animated = false;

      if (searchMatchIds) {
        /* Search mode: highlight links between matches */
        const srcMatch = searchMatchIds.has(sid);
        const tgtMatch = searchMatchIds.has(tid);
        if (srcMatch && tgtMatch) { opacity = 0.55 * linkEntrance; colorBase = "13,148,136"; }
        else if (srcMatch || tgtMatch) { opacity = 0.08 * linkEntrance; }
        else { opacity = 0.03 * linkEntrance; }
      } else if (selectedNodeId && connSel) {
        opacity = 0.75 * linkEntrance; colorBase = "13,148,136"; lineWidth = width + 0.6; animated = true;
      } else if (hoveredId && connHov) {
        opacity = 0.65 * linkEntrance; colorBase = "13,148,136"; lineWidth = width + 0.6; animated = true;
      } else if (selectedNodeId) {
        opacity = 0.04 * linkEntrance;
      } else if (hoveredId) {
        opacity = 0.06 * linkEntrance;
      }

      const colorStr = `rgba(${colorBase}, ${opacity})`;

      /* Curved quadratic bezier control point */
      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) return;

      // Perpendicular midpoint offset for curvature (consistent per link via id hash)
      const seed = (link.id ?? "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const curveDir = seed % 2 === 0 ? 1 : -1;
      const curveMag = 0.12 + (seed % 10) * 0.01;
      const mx = (sx + tx) / 2 + (-dy / dist) * dist * curveMag * curveDir;
      const my = (sy + ty) / 2 + (dx / dist) * dist * curveMag * curveDir;

      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
      ctx.strokeStyle = colorStr;
      ctx.lineWidth = lineWidth;

      // Animated dashed flow for links connected to the hovered/selected node.
      if (animated) {
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -(now * 0.04) % 10;
      }

      ctx.beginPath();
      drawPartialQuadBezier(ctx, sx, sy, mx, my, tx, ty, linkEntrance);
      ctx.stroke();

      // Reset dash so it doesn't leak into subsequent draws.
      if (animated) {
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      }

      /* Directional arrowhead — only once the edge has fully drawn in. */
      if (linkEntrance >= 1) {
        const t = 0.72;
        const t1 = 1 - t;
        const ax = t1 * t1 * sx + 2 * t1 * t * mx + t * t * tx;
        const ay = t1 * t1 * sy + 2 * t1 * t * my + t * t * ty;

        // Tangent direction at t
        const tdx = 2 * t1 * (mx - sx) + 2 * t * (tx - mx);
        const tdy = 2 * t1 * (my - sy) + 2 * t * (ty - my);
        const angle = Math.atan2(tdy, tdx);
        const arrowLen = Math.max(3.5, lineWidth * 2.5);
        const arrowSpread = Math.PI / 7;

        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(
          ax - arrowLen * Math.cos(angle - arrowSpread),
          ay - arrowLen * Math.sin(angle - arrowSpread),
        );
        ctx.lineTo(
          ax - arrowLen * Math.cos(angle + arrowSpread),
          ay - arrowLen * Math.sin(angle + arrowSpread),
        );
        ctx.closePath();
        ctx.fillStyle = colorStr;
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    },
    [selectedNodeId, searchMatchIds, getEntranceScale],
  );

  /* ── Color accessor (for default rendering fallback) ──── */

  const nodeColor = useCallback(
    (node: ForceGraphNode) =>
      highlightedNodeIds?.has(node.id)
        ? "#2563EB"
        : (node.color as string) || getNodeColor(node),
    [highlightedNodeIds],
  );

  /* ── Graph data ───────────────────────────────────────── */

  const fgData = useMemo(
    () => ({
      nodes: filteredNodes.map((node): ForceGraphNode => ({ ...node })),
      links: filteredEdges.map((edge): ForceGraphEdge => ({ ...edge })),
    }),
    [filteredNodes, filteredEdges],
  );

  /* Compact = sidebar (~220–320px) or unknown size. Expanded overlay ≥420px. */
  const isCompact = dimensions.width < 420;

  /* ── Render ───────────────────────────────────────────── */

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ background: BG_WHITE, minHeight: 120 }}
    >
      {/* Header sits above the canvas (z-30). pointer-events only on children
          so pan/zoom still work on the graph around the controls. */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-stretch ${
          isCompact ? "gap-1 px-1.5 pt-1.5" : "gap-2 px-3 pt-2"
        }`}
      >
        <div className="pointer-events-auto w-full min-w-0">
          <div
            className="flex w-full min-w-0 items-stretch gap-0.5 rounded-full border p-0.5"
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              border: "1px solid rgba(0, 0, 0, 0.06)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
            }}
            role="tablist"
            aria-label="Graph view"
          >
            {(
              [
                { key: "exploration", label: "Explore", short: "Explore" },
                { key: "preference", label: "Prefs", short: "Prefs" },
                { key: "all", label: "Both", short: "Both" },
              ] as const
            ).map((tab) => {
              const selected = graphKindTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setGraphKindTab(tab.key);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`min-w-0 flex-1 truncate rounded-full py-1.5 text-center font-medium transition-all ${
                    isCompact ? "px-1 text-[10px] leading-tight" : "px-2.5 text-[11px]"
                  }`}
                  style={
                    selected
                      ? {
                          background: "var(--aria-accent, #0D9488)",
                          color: "#FFFFFF",
                        }
                      : {
                          color: "var(--aria-text-secondary, #6B6B6B)",
                        }
                  }
                >
                  {isCompact ? tab.short : tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pointer-events-auto w-full min-w-0">
          <GraphControls
            compact={isCompact}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            minScore={filters.minScore ?? 0}
            onMinScoreChange={(s) => setFilters({ ...filters, minScore: s })}
            minFrequency={filters.minFrequency ?? 1}
            onMinFrequencyChange={(f) => setFilters({ ...filters, minFrequency: f })}
            onZoomIn={() => graphRef.current?.zoom(1.3, 300)}
            onZoomOut={() => graphRef.current?.zoom(0.7, 300)}
            onFitAll={() => graphRef.current?.zoomToFit(400, 40)}
            nodeTypes={nodeTypes}
            selectedNodeType={filters.nodeType ?? null}
            onNodeTypeChange={(t) => setFilters({ ...filters, nodeType: t ?? undefined })}
            physicsConfig={physicsConfig}
            onPhysicsChange={setPhysicsConfig}
            isLoading={isLoading}
            demoMode={demoMode}
            onDemoModeChange={onDemoModeChange}
          />
        </div>
      </div>

      <NodeDetail
        node={selectedNode}
        onClose={() => setSelectedNodeId(null)}
        relatedNodes={relatedNodeLabels}
      />

      {filteredNodes.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center" style={{ color: "#9C9C9C" }}>
            <p className="text-sm font-medium">
              {graphKindTab === "preference"
                ? "No preferences yet"
                : graphKindTab === "exploration"
                  ? "No exploration topics yet"
                  : "No topics yet"}
            </p>
            <p className="mt-1.5 text-xs" style={{ color: "#C4C4C4" }}>
              {graphKindTab === "preference"
                ? "Rate answers in chat to grow preference nodes"
                : "Start chatting to build your knowledge graph"}
            </p>
          </div>
        </div>
      )}

      {/* Canvas stays under the header (z-0) so tab/toolbar clicks aren't stolen. */}
      <div className="absolute inset-0 z-0">
        {dimensions.width > 0 && dimensions.height > 0 && (
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 text-sm" style={{ color: "#9C9C9C" }}>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
                  Loading graph...
                </div>
              </div>
            }
          >
            <ForceGraph2D<GraphNode, GraphEdge>
              ref={graphRef}
              graphData={fgData}
              width={dimensions.width}
              height={dimensions.height}
              nodeRelSize={3}
              nodeVal="val"
              nodeLabel=""
              nodeColor={nodeColor}
              nodeCanvasObjectMode={() => "replace"}
              nodeCanvasObject={nodeCanvasObject}
              nodePointerAreaPaint={nodePointerAreaPaint}
              linkCanvasObjectMode={() => "replace"}
              linkCanvasObject={linkCanvasObject}
              linkCurvature={0.15}
              autoPauseRedraw={false}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              onNodeDrag={handleNodeDrag}
              onNodeDragEnd={handleNodeDragEnd}
              onBackgroundClick={handleBackgroundClick}
              onEngineStop={handleEngineStop}
              onRenderFramePre={onRenderFramePre}
              warmupTicks={120}
              cooldownTicks={200}
              d3AlphaDecay={0.028}
              d3VelocityDecay={0.4}
              enableZoomInteraction
              enablePanInteraction
              enableNodeDrag
              backgroundColor={BG_WHITE}
            />
          </Suspense>
        )}
      </div>

      {summary && (
        <div
          className={`pointer-events-none absolute z-10 rounded-xl leading-relaxed shadow-md ${
            isCompact
              ? "bottom-2 left-2 right-2 max-w-none px-2 py-1.5 text-[10px] line-clamp-2"
              : "bottom-4 left-4 max-w-xs px-3 py-2 text-xs"
          }`}
          style={{
            background: "rgba(255, 255, 255, 0.92)",
            border: "1px solid rgba(0, 0, 0, 0.06)",
            color: "#6B6B6B",
            backdropFilter: "blur(12px)",
          }}
          title={summary}
        >
          {summary}
        </div>
      )}
    </div>
  );
}

export { useKnowledgeGraph };
export type { GraphNode, GraphEdge, GraphLayout };
