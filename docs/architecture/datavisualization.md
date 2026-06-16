# ARIA Knowledge Graph — Data Visualization Strategy

This document evaluates graph visualization libraries for the ARIA adaptive knowledge graph (Obsidian / Recall-style live topic map). It complements the final implementation plan: chat on the left, force-directed graph on the right, nodes sized by frequency, colored by feedback score, edges weighted by co-occurrence, with search, zoom, pan, and node detail on click.

## Current situation

**Chosen in plan:** `react-force-graph-2d` (dynamic import, SSR disabled)

**Status:** Most of the ARIA stack is implemented — LibSQL graph storage, topic extraction, feedback scoring, `/api/graph`, `useKnowledgeGraph`, `GraphControls`, `NodeDetail`, and split layout in `apps/web`. The remaining friction is in the **visualization layer**:

| Issue | Cause |
|-------|--------|
| TypeScript errors with React 19 | `useRef()` requires an initial value; library generics on `LinkObject` source/target narrow to `never` in some branches |
| API mismatches | Some props exist on 3D (`linkOpacity`) but not 2D; README prop tables differ per package |
| Maintenance risk | Wrapper around `force-graph` (Canvas) + `d3-force-3d`; typings lag React / strict TS |

These are fixable for a **small graph** (tens to low hundreds of nodes). They become painful if you want production-grade typing, long-term upgrades, and scale.

## Requirements (from ARIA plan)

| Requirement | Priority |
|-------------|----------|
| Force-directed layout | Must |
| Node size = frequency | Must |
| Node color = avg feedback score (red → yellow → green) | Must |
| Edge thickness = weight | Must |
| Click node → detail panel | Must |
| Search / filter by label and type | Must |
| Zoom, pan, fit-to-view | Must |
| Pulse / highlight on new topics | Should |
| React 19 + strict TypeScript | Must |
| Next.js App Router (no SSR on canvas/WebGL) | Must |
| Scales to hundreds+ nodes without jank | Should |
| Fits monorepo (`@repo/ai-ui`) | Must |

## Library comparison (2025–2026)

### 1. `@react-sigma/core` + `sigma` + `graphology` — **Recommended default**

| | |
|--|--|
| **Renderer** | WebGL (Sigma.js v2) |
| **Data model** | Graphology graph (nodes/edges + attributes) |
| **Layout** | `graphology-layout-forceatlas2` (ForceAtlas2, Web Worker option) |
| **React** | First-class `@react-sigma/*` hooks and components |
| **Scale** | Designed for large networks (10k+ nodes with tuning) |
| **TypeScript** | Strong; ecosystem split into typed packages |
| **npm** | `@react-sigma/core`, `sigma`, `graphology`, layout plugins |

**Pros:** Best match for **knowledge graphs** and network dashboards; separates data (Graphology) from rendering (Sigma); community detection, shortest path, metrics via Graphology plugins; Web Worker layouts keep UI responsive.

**Cons:** More setup than a single drop-in component; custom node labels/overlays use Sigma reducers or HTML overlays; learning curve for Graphology API.

**When to choose:** Production 2D graph, long-term maintainability, alignment with ARIA’s “live growing knowledge map” story.

---

### 2. `react-force-graph-2d` — **Current implementation (short-term OK)**

| | |
|--|--|
| **Renderer** | HTML Canvas |
| **Physics** | d3-force / ngraph |
| **React** | Single lazy-loaded component |
| **Scale** | Fine for ~100–500 nodes |
| **TypeScript** | Usable but brittle with strict mode + React 19 |

**Pros:** Fast to ship; matches original plan; built-in force simulation; `nodeCanvasObject` for custom drawing (pulse rings, labels); same author’s 3D/VR packages if you ever need depth.

**Cons:** Typing gaps; 2D vs 3D API differences; less ecosystem for graph algorithms; Canvas slows down before WebGL on large graphs.

**When to choose:** MVP deadline, small graphs, team already invested in current `KnowledgeGraph.tsx`.

---

### 3. `@xyflow/react` — **Already in `@repo/ai-ui`**

| | |
|--|--|
| **Renderer** | DOM / SVG (React Flow) |
| **Layout** | Manual or `@xyflow/elk` / dagre — not organic force by default |
| **Scale** | Great for editor-style graphs (100–1000 nodes with virtualization) |
| **TypeScript** | Excellent |

**Pros:** Best-in-class React DX; stable types; node handles, minimap, controls; ideal for **workflow / pipeline / structured** graphs.

**Cons:** Force-directed “blob” layout is not the default UX; more work to feel like Obsidian Graph View; less suited to continuously simulated physics.

**When to choose:** If the product pivots to **editable** or **hierarchical** graphs rather than organic topic clusters.

---

### 4. `cytoscape` + `react-cytoscapejs`

| | |
|--|--|
| **Renderer** | Canvas |
| **Layouts** | Many built-in (COSE, breadthfirst, circle, …) |
| **Scale** | ~5k nodes smooth; main-thread layout can block |
| **TypeScript** | `@types/cytoscape` |

**Pros:** Rich algorithms and styling; widely used in bioinformatics and analysis tools.

**Cons:** Heavier bundle; React integration is thinner than Sigma or xyflow; large-graph layout runs on main thread unless you offload.

**When to choose:** You need **many layout algorithms** in one app and accept more imperative API.

---

### 5. `vis-network`

| | |
|--|--|
| **Renderer** | Canvas |
| **Physics** | Built-in force simulation |
| **Scale** | Moderate |
| **Maintenance** | vis.js lineage; smaller modern React community |

**Pros:** Quick interactive networks, physics out of the box.

**Cons:** Weaker TypeScript/React story; less momentum than Sigma or xyflow in 2025–2026 greenfield apps.

**When to choose:** Legacy parity or prototypes only.

---

### 6. D3.js (direct)

**Pros:** Maximum customization.

**Cons:** Fighting React’s rendering model; SVG doesn’t scale; high implementation cost for the same features ARIA already spec’d.

**When to choose:** Rare — custom one-off charts, not the main knowledge graph.

## Recommendation for ARIA

### Primary recommendation: **Sigma + Graphology (`@react-sigma/core`)**

For a **reliable, modern, production** knowledge graph:

1. Keep **`useKnowledgeGraph`**, **`GraphControls`**, **`NodeDetail`**, and **`/api/graph`** unchanged — they are library-agnostic.
2. Replace the **`ForceGraph2D`** block in `KnowledgeGraph.tsx` with:
   - Build a `graphology` `Graph` from `nodes` / `edges`
   - Map `frequency` → `size`, `avgScore` → `color`, `weight` → edge `size`
   - Run **ForceAtlas2** (optionally in a worker) when data or layout mode changes
   - Use `@react-sigma/core` `<SigmaContainer>` + `@react-sigma/layout-forceatlas2` or manual assign
   - Handle `clickNode` → `setSelectedNodeId` / `onNodeClick`
3. Dynamic import Sigma path (same SSR pattern as today).

**Packages to add:**

```bash
pnpm add --filter @repo/ai-ui graphology sigma @react-sigma/core @react-sigma/layout-forceatlas2 graphology-layout-forceatlas2
```

### Pragmatic alternative: **Stay on `react-force-graph-2d`**

If you want zero migration this week:

- Fix strict TS (done: `useRef(undefined)`, safe `getEndpointId`)
- Keep opacity in `linkColor` RGBA (2D has no `linkOpacity` prop)
- Pin versions and add a thin adapter type layer so library generics don’t leak into app code

Migrate to Sigma when graph size or TS/maintenance cost grows.

### Do not switch to xyflow for this feature

`@xyflow/react` stays valuable elsewhere in the monorepo, but it is the wrong default for an **organic, force-clustered topic map** unless you redesign the UX.

## Feature mapping

| ARIA feature | react-force-graph-2d | Sigma + Graphology |
|--------------|----------------------|--------------------|
| Force layout | Built-in d3-force | ForceAtlas2 (+ worker) |
| Node size | `nodeVal` / canvas radius | `size` reducer |
| Node color | `nodeColor` / canvas fill | `color` attribute + reducer |
| Edge weight | `linkWidth` | edge `size` |
| Labels | `nodeCanvasObject` | `label` + renderers or overlay |
| Zoom / pan | built-in | Sigma camera |
| Fit view | `zoomToFit()` | `camera.animate` / `autoRescale` |
| Pulse new nodes | custom canvas ring | animate `size` or overlay |
| Selected node dimming | `globalAlpha` in canvas | reducers + `selectedNode` state |
| Search filter | filter arrays before render | rebuild subgraph or hide via reducers |

## Migration checklist (Sigma path)

- [ ] Add dependencies to `packages/ai-ui/package.json`
- [ ] Create `graphology` builder: `buildGraphologyGraph(nodes, edges)`
- [ ] New client component `KnowledgeGraphSigma.tsx` (or refactor in place)
- [ ] Wire ForceAtlas2 on `nodes`/`edges` change; stop simulation after stabilize
- [ ] Port pulse + selection dimming to Sigma reducers or `@react-sigma/core` events
- [ ] Remove `react-force-graph-2d` when parity verified
- [ ] `pnpm run check-types` + manual test on split page

## Decision log

| Date | Decision |
|------|----------|
| Plan phase | `react-force-graph-2d` for speed and plan alignment |
| Current | TS/React 19 friction documented; **Sigma + Graphology** recommended for production reliability |
| Monorepo | Keep graph UI in `@repo/ai-ui`; `@xyflow/react` retained for non-knowledge-graph flows |

## Additional Industry Perspective: React Graph Visualization Guide (Cambridge Intelligence)

> **Source:** [A guide to React graph visualization](https://cambridge-intelligence.com/blog/react-graph-visualization-library/) (Cambridge Intelligence, July 2025)

This resource provides a comprehensive industry perspective on building interactive, dynamic, and scalable node-link diagrams in React applications. Key insights include:

### Why React for Graph Visualization

React's component-based structure and support for state management enable developers to build highly interactive visualizations that respond in real-time to user actions, streaming data, and complex conditional styling. Traditional JavaScript graph libraries often require imperative code and direct DOM manipulation, while React's declarative programming model allows developers to focus on what the UI should look like based on data.

### Use Cases

- **Cybersecurity** — Analyzing device relationships, alert patterns, and network traffic with custom filter components and reusable node styles
- **Intelligence & Law Enforcement** — Mapping criminal networks, tracking financial transactions, building standardized investigation templates
- **Financial Services & Fraud Detection** — Syncing with real-time transaction feeds, highlighting anomalies based on custom business rules
- **AI Decision Making** — Visualizing and explaining AI reasoning through interactive graphs
- **IoT Device Management** — Interactive network topology views integrated with device control panels

### Key Approaches

1. **Choose the right implementation approach** — Open source library, off-the-shelf solution, or comprehensive SDK
2. **Define data structure properly** — Nodes need ID, label, visual styling (colors, icons), and metadata for filtering/grouping
3. **Architect for streaming updates** — Use React's state and effect hooks to manage incoming data feeds while maintaining layout continuity

### Recommended Libraries (per Cambridge Intelligence)

| Library | Type | Notes |
|---------|------|-------|
| **ReGraph** | Commercial SDK | Designed specifically for complex graph data, declarative API, supports combos, layouts, filtering, time-based views; handles large datasets efficiently |
| **Cytoscape.js** | Open Source | Core graph features; combined with React wrapper for React apps; may require more boilerplate |
| **React Flow** | Open Source | Great for node-based UIs and low-code workflows; good for diagram builders but may lack deep analytics features |

### Alternatives to React-Based Solutions

- **KeyLines** — JavaScript Graph Visualization library with high-performance, enterprise-grade visualizations (imperative API)
- **D3.js** — Lots of control and flexibility but steep learning curve, limited graph styling, low-level
- **Chart.js** — Better for simpler chart types (bar, pie, line); not recommended for complex graphs
- **Neo4j Bloom** — Query-based exploration limited to Neo4j ecosystem
- **Gephi** — Desktop tool for static graph analysis; not suited for web apps or real-time data

### Key Takeaways

1. **Seamless integration reduces development friction** — React graph visualizations embed directly into existing applications
2. **Dynamic exploration drives actionable insights** — Drill-downs, filtering, and live updates keep users in control of data
3. **Structured visualizations simplify complex networks** — Hierarchical layouts, nested combos, and streaming data reduce clutter

---

## References

- [Sigma.js](https://www.sigmajs.org/)
- [@react-sigma/core (npm)](https://www.npmjs.com/package/@react-sigma/core)
- [Graphology](https://graphology.github.io/)
- [react-force-graph](https://github.com/vasturiano/react-force-graph)
- [@xyflow/react](https://reactflow.dev/)
- [Cytoscape.js vs vis-network vs Sigma (2026)](https://www.pkgpulse.com/guides/cytoscape-vs-vis-network-vs-sigma-graph-visualization-2026)
- [React Graph Visualization Guide — Cambridge Intelligence](https://cambridge-intelligence.com/blog/react-graph-visualization-library/)
