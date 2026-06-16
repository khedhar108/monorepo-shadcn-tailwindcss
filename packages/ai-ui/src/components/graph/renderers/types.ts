import type { GraphNode, GraphEdge } from "../../../hooks/use-knowledge-graph";
import type { PhysicsConfig, GraphLayout } from "../GraphControls";

export type GraphRendererProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  searchQuery: string;
  physicsConfig: PhysicsConfig;
  layout: GraphLayout;
  demoMode: boolean;
  highlightedNodeIds?: Set<string>;
  pulseNodeIds?: Set<string>;
  isLoading: boolean;
  summary: string;
  className?: string;
  onNodeClick: (nodeId: string) => void;
  onNodeHover: (nodeId: string | null) => void;
  onBackgroundClick: () => void;
  onEngineStop: () => void;
};

export type GraphRendererRef = {
  zoomIn: () => void;
  zoomOut: () => void;
  fitAll: () => void;
  centerAt: (x: number, y: number, durationMs?: number) => void;
  reheat: () => void;
};
