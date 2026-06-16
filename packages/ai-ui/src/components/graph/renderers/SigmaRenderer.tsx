/*
 * SigmaRenderer.tsx
 *
 * Skeleton for swapping react-force-graph-2d with Sigma.js v3 + Graphology.
 * Sigma.js provides WebGL rendering that scales to thousands of nodes
 * while maintaining 60fps — ideal when the knowledge graph grows past 200 nodes.
 *
 * To activate:
 * 1. `pnpm add sigma graphology @sigma/edge-curve`
 * 2. Replace `import { KnowledgeGraph } from "./KnowledgeGraph"` with
 *    `import { SigmaKnowledgeGraph } from "./renderers/SigmaRenderer"` in page.tsx
 * 3. Uncomment and implement the sections marked TODO below.
 *
 * Dependencies needed:
 *   sigma: ^3.0.3        — WebGL graph renderer
 *   graphology: ^0.26.0  — Graph data model
 *   @sigma/edge-curve: ^3.1.0 — Curved edges
 */

"use client";

import { useEffect, useRef } from "react";
import type { GraphRendererProps, GraphRendererRef } from "./types";

/*
import Sigma from "sigma";
import Graph from "graphology";
import EdgeCurveProgram from "@sigma/edge-curve";
*/

export function SigmaRenderer(
  _props: GraphRendererProps,
  _ref: React.ForwardedRef<GraphRendererRef>,
) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // TODO: Initialize sigma.js instance
    //
    // const graph = new Graph();
    //
    // props.nodes.forEach((n) => {
    //   graph.addNode(n.id, {
    //     label: n.label,
    //     size: getNodeRadius(n.frequency, props.physicsConfig.nodeSize),
    //     color: getNodeTypeColor(n.nodeType),
    //     x: Math.random() * 10,
    //     y: Math.random() * 10,
    //     nodeType: n.nodeType,
    //     frequency: n.frequency,
    //     avgScore: n.avgScore,
    //   });
    // });
    //
    // props.edges.forEach((e) => {
    //   graph.addEdge(e.sourceId, e.targetId, {
    //     size: getLinkWidth(e.weight),
    //     color: "#2a2a3a",
    //     type: "curved",
    //   });
    // });
    //
    // const renderer = new Sigma(graph, containerRef.current!, {
    //   stagePadding: 40,
    //   labelFont: "JetBrains Mono, monospace",
    //   labelSize: 11,
    //   labelColor: { color: "#e4e4ed" },
    //   labelRenderedSizeThreshold: 8,
    //   defaultEdgeType: "curved",
    //   edgeProgramClasses: { curved: EdgeCurveProgram },
    // });
    //
    // // Run ForceAtlas2 layout in a Web Worker
    // // See: graphology-layout-forceatlas2
    //
    // return () => renderer.kill();

    return undefined;
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ background: "#06060a" }}
    />
  );
}
