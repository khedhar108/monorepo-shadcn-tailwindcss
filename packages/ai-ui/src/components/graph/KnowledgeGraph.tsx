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

/* ── GitNexus-inspired design tokens ────────────────────────── */

const BG_VOID = "#06060a";
const NODE_MIN_RADIUS = 2.0;
const NODE_MAX_RADIUS = 15;
const PULSE_DURATION_MS = 1800;
const ACCENT_PURPLE = "#7c3aed";

type NodeColorMap = Record<string, string>;
const NODE_TYPE_COLORS: NodeColorMap = {
  system: "#22d3ee",
  topic: "#a855f7",
  entity: "#10b981",
  concept: "#3b82f6",
  preference: "#f59e0b",
  feature: "#ec4899",
};
const NODE_DEFAULT_COLOR = "#64748b";

function getNodeTypeColor(nodeType: string): string {
  return NODE_TYPE_COLORS[nodeType] ?? NODE_DEFAULT_COLOR;
}

/* ── Helpers ────────────────────────────────────────────────── */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const ch = (c: number) => Math.min(255, Math.round(c + (255 - c) * (amount / 100)));
  return `rgb(${ch(r)}, ${ch(g)}, ${ch(b)})`;
}

function getNodeRadius(freq: number, sizeMultiplier: number): number {
  const base = 3.0 * sizeMultiplier * (1 + Math.log2(freq + 1) * 0.45);
  return Math.max(NODE_MIN_RADIUS, Math.min(NODE_MAX_RADIUS, base));
}

function getLinkWidth(weight: number): number {
  return Math.min(2.8, 0.4 + Math.log(weight + 1) * 0.35);
}

function getEndpointId(endpoint: unknown): string | null {
  if (endpoint == null) return null;
  if (typeof endpoint === "object" && "id" in endpoint) {
    const id = (endpoint as { id?: string | number }).id;
    return id === undefined ? null : String(id);
  }
  return String(endpoint);
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
  const { nodes, edges, summary, isLoading, filters, setFilters, refetch } =
    useKnowledgeGraph(userId, demoMode);

  const graphRef = useRef<ForceGraphRef | undefined>(undefined);
  const previousNodeIdsRef = useRef<Set<string>>(new Set());
  const hasAutoFittedRef = useRef(false);
  const physicsConfigRef = useRef<PhysicsConfig>(DEFAULT_PHYSICS);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [layout, setLayout] = useState<GraphLayout>("force");
  const [pulseNodeIds, setPulseNodeIds] = useState<Set<string>>(new Set());
  const [physicsConfig, setPhysicsConfig] = useState<PhysicsConfig>(DEFAULT_PHYSICS);

  physicsConfigRef.current = physicsConfig;

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

  /* ── Filtering ───────────────────────────────────────── */

  const filteredNodes = useMemo(() => {
    let next = nodes;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      next = nodes.filter((n) => n.label.toLowerCase().includes(q));
    }
    return next;
  }, [nodes, searchQuery]);

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
        graphRef.current?.centerAt(node.x, node.y, 350);
      }
    },
    [onNodeClick],
  );

  const handleNodeHover = useCallback(
    (node: ForceGraphNode | null) => setHoveredNodeId(node?.id ?? null),
    [],
  );

  const handleBackgroundClick = useCallback(
    () => setSelectedNodeId(null),
    [],
  );

  /* ── Physics ──────────────────────────────────────────── */

  const applyPhysics = useCallback((cfg: PhysicsConfig): boolean => {
    const g = graphRef.current;
    if (!g) return false;
    (g.d3Force("link") as { distance?: (d: number) => unknown } | undefined)?.distance?.(cfg.linkDistance);
    (g.d3Force("charge") as { strength?: (s: number) => unknown } | undefined)?.strength?.(-cfg.repulsion);
    return true;
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (applyPhysics(physicsConfigRef.current)) {
        hasAutoFittedRef.current = false;
        graphRef.current?.d3ReheatSimulation();
      }
    }, 50);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!applyPhysics(physicsConfig)) return;
    hasAutoFittedRef.current = false;
    graphRef.current?.d3ReheatSimulation();
  }, [physicsConfig, applyPhysics]);

  /* ── Auto-fit ─────────────────────────────────────────── */

  const handleEngineStop = useCallback(() => {
    if (hasAutoFittedRef.current) return;
    hasAutoFittedRef.current = true;
    graphRef.current?.zoomToFit(600, 72);
  }, []);

  /* ── Node visuals ─────────────────────────────────────── */

  const getNodeVisuals = useCallback(
    (node: ForceGraphNode) => {
      const freq = node.frequency;
      const baseR = getNodeRadius(freq, physicsConfig.nodeSize);
      const pulsing = combinedPulseIds.has(node.id);
      const radius = pulsing ? baseR * 1.3 : baseR;
      const typeColor = getNodeTypeColor(node.nodeType);
      const color = node.color ?? typeColor;
      const isSelected = node.id === selectedNodeId;
      const isHovered = node.id === hoveredNodeId;
      const isConnectedSelected = selectedNodeId
        ? (neighborIds.get(node.id)?.has(selectedNodeId) ?? false)
        : false;
      const isConnectedHovered = hoveredNodeId
        ? (neighborIds.get(node.id)?.has(hoveredNodeId) ?? false)
        : false;

      let opacity = 1;
      let scale = 1;
      if (selectedNodeId) {
        if (isSelected) { opacity = 1; scale = 1.8; }
        else if (isConnectedSelected) { opacity = 1; scale = 1.3; }
        else { opacity = 0.18; scale = 0.65; }
      } else if (hoveredNodeId) {
        if (isHovered) { opacity = 1; scale = 1.4; }
        else if (isConnectedHovered) { opacity = 1; scale = 1.1; }
        else { opacity = 0.25; scale = 0.7; }
      }

      return {
        radius, baseRadius: baseR, color, isSelected, isHovered,
        pulsing, opacity, scale, isConnectedSelected, isConnectedHovered,
      };
    },
    [combinedPulseIds, hoveredNodeId, neighborIds, physicsConfig.nodeSize, selectedNodeId],
  );

  /* ── Link visuals ─────────────────────────────────────── */

  const getLinkVisuals = useCallback(
    (link: ForceGraphEdge) => {
      const sid = getEndpointId(link.source) ?? link.sourceId;
      const tid = getEndpointId(link.target) ?? link.targetId;
      const w = (link.value as number) || 1;
      const width = getLinkWidth(w);

      const connSel = selectedNodeId
        ? sid === selectedNodeId || tid === selectedNodeId
        : false;
      const connHov = hoveredNodeId
        ? sid === hoveredNodeId || tid === hoveredNodeId
        : false;

      let opacity = 0.08 + Math.min(0.32, w * 0.03);
      let color = "rgba(148,163,184,";
      if (selectedNodeId) {
        if (connSel) { opacity = 0.9; color = "rgba(124,58,237,"; }
        else { opacity = 0.04; }
      } else if (hoveredNodeId) {
        if (connHov) { opacity = 0.75; color = "rgba(124,58,237,"; }
        else { opacity = 0.06; }
      }

      return { sid, tid, w, width, opacity, color };
    },
    [hoveredNodeId, selectedNodeId],
  );

  /* ── Canvas: background gradient ──────────────────────── */

  const onRenderFramePre = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      const grad = ctx.createRadialGradient(
        w / 2, h / 2, 0,
        w / 2, h / 2, Math.max(w, h) * 0.55,
      );
      grad.addColorStop(0, "rgba(124, 58, 237, 0.04)");
      grad.addColorStop(0.5, "rgba(124, 58, 237, 0.015)");
      grad.addColorStop(1, "#06060a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
    [],
  );

  /* ── Canvas: node rendering ───────────────────────────── */

  const nodeCanvasObject = useCallback(
    (
      node: ForceGraphNode,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      const x = (node.x as number) || 0;
      const y = (node.y as number) || 0;
      const vis = getNodeVisuals(node);
      const { radius, baseRadius, color, isSelected, pulsing, opacity, scale } = vis;
      const isAriaHub = node.id === "demo:aria" || node.nodeType === "system";
      const drawR = radius * scale;

      ctx.globalAlpha = opacity;

      /* Outer glow (selected / pulsing / hub) */
      if (isSelected || pulsing || isAriaHub) {
        const glowR = drawR * (pulsing ? 2.5 : isSelected ? 2.2 : 1.8);
        const glow = ctx.createRadialGradient(x, y, drawR * 0.5, x, y, glowR);
        const { r, g, b } = hexToRgb(isSelected || isAriaHub ? ACCENT_PURPLE : color);
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${pulsing ? 0.35 : 0.22})`);
        glow.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.08)`);
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Main sphere with 3D highlight */
      const bodyGrad = ctx.createRadialGradient(
        x - drawR * 0.3, y - drawR * 0.3, drawR * 0.1,
        x, y, drawR,
      );
      const hl = lighten(color, 40);
      bodyGrad.addColorStop(0, hl);
      bodyGrad.addColorStop(0.5, color);
      bodyGrad.addColorStop(1, color);

      ctx.beginPath();
      ctx.arc(x, y, drawR, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      /* Border ring for selected / hub */
      if (isSelected || isAriaHub) {
        ctx.strokeStyle = isSelected
          ? `rgba(124, 58, 237, 0.9)`
          : `${color}80`;
        ctx.lineWidth = isSelected ? 1.8 : 1.2;
        ctx.stroke();
      }

      /* Monospace labels */
      const shouldLabel = isAriaHub || isSelected || globalScale > 0.7 || node.frequency >= 3;

      if (shouldLabel) {
        const fontSize = Math.max(9, Math.min(13, 11 / Math.max(globalScale, 0.6)));
        ctx.font = `500 ${fontSize}px "JetBrains Mono", "Consolas", "Cascadia Code", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const label = node.label;
        const textY = y + drawR + 5;
        const tw = ctx.measureText(label).width;
        const padX = 5;
        const padY = 3;
        const pw = tw + padX * 2;
        const ph = fontSize + padY * 2;
        const px = x - pw / 2;
        const py = textY - padY;

        /* Dark pill */
        ctx.fillStyle = "rgba(10, 10, 16, 0.82)";
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, 5);
        ctx.fill();
        ctx.strokeStyle = `${color}40`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.fillStyle = "#e4e4ed";
        ctx.fillText(label, x, textY);
      }

      ctx.globalAlpha = 1;
    },
    [getNodeVisuals],
  );

  /* ── Hit area ─────────────────────────────────────────── */

  const nodePointerAreaPaint = useCallback(
    (node: ForceGraphNode, color: string, ctx: CanvasRenderingContext2D) => {
      const { radius, scale } = getNodeVisuals(node);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(
        (node.x as number) || 0,
        (node.y as number) || 0,
        radius * scale + 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    },
    [getNodeVisuals],
  );

  /* ── Canvas: curved link rendering ────────────────────── */

  const linkCanvasObject = useCallback(
    (link: ForceGraphEdge, ctx: CanvasRenderingContext2D) => {
      const source = link.source as ForceGraphNode;
      const target = link.target as ForceGraphNode;
      if (!source || !target) return;

      const sx = (source.x as number) || 0;
      const sy = (source.y as number) || 0;
      const tx = (target.x as number) || 0;
      const ty = (target.y as number) || 0;

      const vis = getLinkVisuals(link);
      const { width, opacity } = vis;

      /* Curved quadratic bezier */
      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) return;

      // Perpendicular midpoint offset for curvature (consistent per link via id hash)
      const seed = (link.id ?? "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const curveDir = seed % 2 === 0 ? 1 : -1;
      const curveMag = 0.14 + (seed % 10) * 0.012;
      const mx = (sx + tx) / 2 + (-dy / dist) * dist * curveMag * curveDir;
      const my = (sy + ty) / 2 + (dx / dist) * dist * curveMag * curveDir;

      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(mx, my, tx, ty);
      ctx.strokeStyle = vis.color + String(opacity) + ")";
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
    [getLinkVisuals],
  );

  /* ── Color accessor (for default rendering fallback) ──── */

  const nodeColor = useCallback(
    (node: ForceGraphNode) =>
      highlightedNodeIds?.has(node.id)
        ? "#3b82f6"
        : (node.color as string) || getNodeTypeColor(node.nodeType),
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

  /* ── Render ───────────────────────────────────────────── */

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: BG_VOID }}
    >
      <GraphControls
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        minScore={filters.minScore ?? 0}
        onMinScoreChange={(s) => setFilters({ ...filters, minScore: s })}
        minFrequency={filters.minFrequency ?? 1}
        onMinFrequencyChange={(f) => setFilters({ ...filters, minFrequency: f })}
        layout={layout}
        onLayoutChange={setLayout}
        onZoomIn={() => graphRef.current?.zoom(1.3, 300)}
        onZoomOut={() => graphRef.current?.zoom(0.7, 300)}
        onFitAll={() => graphRef.current?.zoomToFit(400, 64)}
        nodeTypes={nodeTypes}
        selectedNodeType={filters.nodeType ?? null}
        onNodeTypeChange={(t) => setFilters({ ...filters, nodeType: t ?? undefined })}
        physicsConfig={physicsConfig}
        onPhysicsChange={setPhysicsConfig}
        isLoading={isLoading}
        demoMode={demoMode}
        onDemoModeChange={onDemoModeChange}
      />

      <NodeDetail
        node={selectedNode}
        onClose={() => setSelectedNodeId(null)}
        relatedNodes={relatedNodeLabels}
      />

      {filteredNodes.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center" style={{ color: "#5a5a70" }}>
            <p className="text-sm font-medium">No topics yet</p>
            <p className="mt-1.5 text-xs" style={{ color: "#3a3a50" }}>
              Start chatting to build your knowledge graph
            </p>
          </div>
        </div>
      )}

      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm" style={{ color: "#8888a0" }}>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#7c3aed] border-t-transparent" />
              Loading graph...
            </div>
          </div>
        }
      >
        <ForceGraph2D<GraphNode, GraphEdge>
          ref={graphRef}
          graphData={fgData}
          nodeRelSize={3}
          nodeVal="val"
          nodeLabel="label"
          nodeColor={nodeColor}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkCanvasObjectMode={() => "replace"}
          linkCanvasObject={linkCanvasObject}
          linkCurvature={0.2}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onBackgroundClick={handleBackgroundClick}
          onEngineStop={handleEngineStop}
          onRenderFramePre={onRenderFramePre}
          warmupTicks={layout === "force" ? 80 : 0}
          cooldownTicks={layout === "force" ? 150 : 0}
          d3AlphaDecay={layout === "force" ? 0.018 : 0}
          d3VelocityDecay={layout === "force" ? 0.26 : 0}
          enableZoomInteraction
          enablePanInteraction
          enableNodeDrag
          autoPauseRedraw
          backgroundColor={BG_VOID}
          width={800}
          height={600}
        />
      </Suspense>

      {summary && (
        <div
          className="absolute bottom-4 left-4 max-w-xs rounded-lg px-3 py-2 text-xs leading-relaxed shadow-lg"
          style={{
            background: "rgba(10, 10, 16, 0.9)",
            border: "1px solid rgba(124, 58, 237, 0.2)",
            color: "#8888a0",
            backdropFilter: "blur(12px)",
          }}
        >
          {summary}
        </div>
      )}
    </div>
  );
}

export { useKnowledgeGraph };
export type { GraphNode, GraphEdge, GraphLayout };
