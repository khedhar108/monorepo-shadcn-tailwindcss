# ARIA Knowledge Graph — Change Log (Dark → Light Overhaul)

This document explains every change made to the Knowledge Graph visualization, comparing the previous dark theme implementation with the new light theme. The existing expand/collapse logic, data model, API layer, hooks, and caching are **completely unchanged**.

---

## 1. Background & Canvas

### Previous (Dark GitNexus)
- **Background**: `#06060a` (near-black void)
- **Canvas gradient**: Radial purple glow `rgba(124, 58, 237, 0.04)` → `#06060a`
- **Aesthetic**: Dark atmospheric glow, no grid

### New (Clean White)
- **Background**: `#FFFFFF` (pure white)
- **Canvas gradient**: Subtle radial teal glow `rgba(13, 148, 136, 0.025)` center → transparent edges
- **Aesthetic**: Clean, minimal, matches ARIA's warm white surface (`#FAFAF8`)

```diff
- const BG_VOID = "#06060a";
+ const BG_WHITE = "#FFFFFF";
```

---

## 2. Node Rendering

### Previous
- **Style**: 3D sphere with `createRadialGradient` highlight offset top-left
- **Radius**: 2–15px range (oversized, frequent overlap)
- **Selection glow**: Purple `#7c3aed`
- **Border**: Only on selected/system nodes

### New
- **Style**: Flat filled circle — clean, minimal
- **Radius**: 3–8px range (smaller, tighter, Obsidian-like)
- **Selection glow**: Teal `#0D9488` (matches ARIA brand)
- **Border**: Subtle 0.5px border on ALL nodes (node color at 35% opacity for definition on white)

```diff
- const NODE_MIN_RADIUS = 2.0;
- const NODE_MAX_RADIUS = 15;
+ const NODE_MIN_RADIUS = 3;
+ const NODE_MAX_RADIUS = 8;

- const ACCENT_PURPLE = "#7c3aed";
+ const ACCENT_TEAL = "#0D9488";

# Radius formula — tighter distribution
- const base = 3.0 * sizeMultiplier * (1 + Math.log2(freq + 1) * 0.45);
+ const base = 2.5 * sizeMultiplier * (1 + Math.log2(freq + 1) * 0.8);
```

### Node shape comparison

| Aspect | Previous | New |
|--------|----------|-----|
| Fill | 3D radial gradient (sphere effect) | Flat solid color |
| Border (idle) | None | 0.5px, `color@35%` opacity |
| Border (selected) | Purple 1.8px | Teal 1.5px |
| Glow (selected) | Purple, 2.2× radius | Teal, 2.0× radius |
| Glow (pulse) | Cyan, 2.5× radius | Node color, 2.4× radius |

---

## 3. Node Color Palette

Deeper, more saturated colors that read clearly on a white background:

| Node Type | Previous (Dark BG) | New (White BG) |
|-----------|-------------------|----------------|
| `system` | `#22d3ee` (cyan) | `#0D9488` (teal) |
| `topic` | `#a855f7` (light purple) | `#7C3AED` (deeper purple) |
| `entity` | `#10b981` (light emerald) | `#059669` (deeper emerald) |
| `concept` | `#3b82f6` (light blue) | `#2563EB` (deeper blue) |
| `preference` | `#f59e0b` (light amber) | `#D97706` (deeper amber) |
| `feature` | `#ec4899` (light pink) | `#DB2777` (deeper pink) |
| (default) | `#64748b` (slate) | `#6B7280` (gray) |

**Why**: Light/pastel colors that looked great on dark backgrounds become washed out on white. The new palette uses deeper saturations.

---

## 4. Labels — Hover-Only (Obsidian-style)

### Previous
Labels were **always visible** when ANY of these conditions were true:
- Node is ARIA hub (`isAriaHub`)
- Node is selected
- Zoom level > 0.7 (`globalScale > 0.7`)
- Node frequency ≥ 3

This caused massive label clutter, especially at high zoom levels.

### New
Labels show **ONLY on hover or selection**:
```diff
- const shouldLabel = isAriaHub || isSelected || globalScale > 0.7 || node.frequency >= 3;
+ if (isHovered || isSelected) {
```

### Label style comparison

| Aspect | Previous | New |
|--------|----------|-----|
| Visibility | Always (at zoom > 0.7 or freq ≥ 3) | **Hover/select only** |
| Background | Dark pill `rgba(10, 10, 16, 0.82)` | White pill `#FFFFFF` with subtle border |
| Text color | `#e4e4ed` (white) | `#1A1A1A` (dark) |
| Font | `JetBrains Mono` (monospace) | `Inter, system-ui` (matches ARIA) |
| Type indicator | Colored border on pill | Colored dot (3px) inside pill |
| Border | `${color}40` (faint color) | `rgba(0, 0, 0, 0.08)` (subtle gray) |

---

## 5. Node Overlap — Collision Force (THE critical fix)

### Previous
**No collision detection at all.** d3-force was configured with only `charge` and `link` forces. Nodes freely overlapped.

### New
Added an **inline collision force** that prevents node overlap:

```ts
function createCollideForce(radiusFn, strength = 0.85, iterations = 3) {
  // Checks every node pair per tick
  // If two nodes overlap (distance < radiusA + radiusB), pushes them apart
  // Uses velocity adjustments for smooth separation
}
```

- **Collision radius**: `nodeVisualRadius + 8px` padding
- **Strength**: 0.85 (strong enough to prevent overlap, soft enough to avoid jitter)
- **Iterations**: 3 per tick (ensures convergence)
- **No external dependency** — implemented inline, avoids requiring `d3-force` in package.json

---

## 6. Directional Arrows on Edges

### Previous
No arrows. Edges were plain curved lines with no directionality indication.

### New
Small arrowheads drawn at **72% along each bezier curve**:

```ts
// Arrow position on quadratic bezier at t=0.72
const t = 0.72;
const ax = (1-t)² * sx + 2*(1-t)*t * mx + t² * tx;
const ay = (1-t)² * sy + 2*(1-t)*t * my + t² * ty;

// Tangent direction for arrow rotation
const tdx = 2*(1-t) * (mx - sx) + 2*t * (tx - mx);
const angle = Math.atan2(tdy, tdx);

// Triangle arrowhead
ctx.moveTo(ax, ay);
ctx.lineTo(ax - arrowLen * cos(angle - π/7), ...);
ctx.lineTo(ax - arrowLen * cos(angle + π/7), ...);
```

- **Arrow length**: `max(3.5, linkWidth * 2.5)` — scales with edge weight
- **Arrow spread**: π/7 (≈25.7°) — narrow, clean
- **Position**: 72% along the curve — avoids overlapping with source/target nodes
- **Color**: Same as edge color + opacity — visually unified

---

## 7. Edge Rendering

### Previous
- Default color: `rgba(148, 163, 184, opacity)` (slate gray)
- Connected to selected: `rgba(124, 58, 237, opacity)` (purple)
- Width: `min(2.8, 0.4 + log(weight + 1) * 0.35)`

### New
- Default color: `rgba(180, 185, 195, opacity)` (lighter gray — better on white)
- Connected to selected/hovered: `rgba(13, 148, 136, opacity)` (teal)
- Width: `min(2.0, 0.3 + log(weight + 1) * 0.28)` (thinner)

```diff
# Default link opacity range
- opacity = 0.08 + min(0.32, weight * 0.03)
+ opacity = 0.12 + min(0.2, weight * 0.02)

# Selected link color
- "rgba(124,58,237," (purple)
+ "rgba(13,148,136," (teal)
```

---

## 8. Physics / d3-Force Configuration

### Previous defaults
```ts
linkDistance: 120,
repulsion: 180,
nodeSize: 1.0,
```

### New defaults
```ts
linkDistance: 160,  // +33% — more breathing room
repulsion: 280,    // +56% — stronger push apart
nodeSize: 1.0,     // unchanged
```

### Additional force tuning
```diff
+ d3Force("charge").distanceMax(250)  // Prevents distant nodes from drifting endlessly

# Simulation parameters
- d3AlphaDecay: 0.018
+ d3AlphaDecay: 0.025   // Faster convergence — less chaos
- d3VelocityDecay: 0.26
+ d3VelocityDecay: 0.35  // More damping — smoother settling
- warmupTicks: 80
+ warmupTicks: 120       // Better initial layout before render
- cooldownTicks: 150
+ cooldownTicks: 200     // Longer simulation for better spacing
```

---

## 9. Selection & Hover Behavior

### Opacity when a node is selected

| State | Previous opacity/scale | New opacity/scale |
|-------|----------------------|-------------------|
| Selected node | 1.0 / 1.8× | 1.0 / 1.6× (less dramatic) |
| Connected neighbor | 1.0 / 1.3× | 1.0 / 1.2× |
| Unrelated node | 0.18 / 0.65× | **0.15** / 0.7× (more aggressive fade) |

### Opacity when hovering

| State | Previous | New |
|-------|----------|-----|
| Hovered node | 1.0 / 1.4× | 1.0 / 1.3× |
| Connected neighbor | 1.0 / 1.1× | 1.0 / 1.1× |
| Unrelated node | 0.25 / 0.7× | **0.2** / 0.75× |

**Why**: On a white background, slightly more aggressive fading creates better visual isolation of the focused cluster.

---

## 10. GraphControls (Filter/Settings Panel)

### Theme tokens swapped

| Token | Previous (Dark) | New (Light) |
|-------|----------------|-------------|
| `SURFACE` | `#101018` | `#FFFFFF` |
| `ELEVATED` | `#16161f` | `#F4F3F0` |
| `HOVER` | `#1c1c28` | `#EBEAE6` |
| `BORDER_SUBTLE` | `#1e1e2a` | `#F0EEED` |
| `BORDER` | `#2a2a3a` | `#E8E5E0` |
| `TEXT_PRIMARY` | `#e4e4ed` | `#1A1A1A` |
| `TEXT_SECONDARY` | `#8888a0` | `#6B6B6B` |
| `TEXT_MUTED` | `#5a5a70` | `#9C9C9C` |
| `ACCENT` | `#7c3aed` (purple) | `#0D9488` (teal) |
| `ACCENT_DIM` | `#5b21b6` (dark purple) | `#0F766E` (dark teal) |

Added `boxShadow: '0 2px 8px rgba(0,0,0,0.06)'` to the settings panel for depth.

---

## 11. NodeDetail Panel

### Theme changes

| Aspect | Previous | New |
|--------|----------|-----|
| Background | `rgba(16, 16, 24, 0.96)` | `rgba(255, 255, 255, 0.96)` |
| Shadow | None | `0 4px 20px rgba(0,0,0,0.08)` |
| Heading | `#e4e4ed` | `#1A1A1A` |
| Secondary text | `#8888a0` | `#6B6B6B` |
| Close button hover | `bg-white/10` | `bg-black/5` |
| Pill backgrounds | `rgba(255,255,255,0.04)` | `rgba(0,0,0,0.03)` |

---

## 12. Expanded Graph Overlay (page.tsx)

### Previous
- Backdrop: `rgba(6, 6, 10, 0.92)` (near-black)
- Toolbar: `rgba(16, 16, 24, 0.95)` with dashed dark border
- Buttons: Dark backgrounds (`#16161f`), dark borders (`#2a2a3a`)
- Graph container: `#06060a` background
- Hint card: Dark background, purple accent

### New
- Backdrop: `rgba(250, 250, 248, 0.95)` (translucent white)
- Toolbar: `rgba(255, 255, 255, 0.95)` with ARIA border
- Buttons: Light backgrounds (`#F4F3F0`), ARIA borders (`#E8E5E0`)
- Graph container: `#FFFFFF` with shadow `0 4px 24px rgba(0,0,0,0.06)`
- Hint card: White background, emerald accent

**The expand/collapse toggle logic is completely untouched.**

---

## 13. Scaling to 200 Nodes & Sparse Edge Generation

To test the graph with realistic scale and density, the demo dataset was scaled up from 50 nodes to **200 nodes** (1 system hub, 80 topics, 45 entities, 35 concepts, 25 preferences, and 14 features). 

To prevent this 4× increase in nodes from turning the canvas into a dense web of overlapping lines, the edge generation algorithms in `use-knowledge-graph.ts` were overhauled:

- **Hub Connections**: The ARIA system hub now connects to ~40% of nodes dynamically (using a `Math.random() > 0.6` filter) rather than 100% of nodes. This preserves the central hub presence without creating star-burst clutter.
- **Topic-Entity/Concept Links**: Each topic connects to exactly 2 entities (was a wider index modulo) and 1–2 concepts.
- **Inter-Entity Connections**: Reduced inter-entity connection probability to 20% (using `Math.random() > 0.8`) to allow distinct regional clusters to form.
- **Inter-Topic Connections**: Restricted neighbor links to immediate neighbors (within `±2` indices instead of `±3`) and lowered density to 30% chance.
- **Cross-Type Bridges**: Added sparse concept ↔ entity links (`Math.random() > 0.5`) to create thin, realistic bridge pathways between different categories.

This ensures that even at 200 nodes, the graph remains highly readable, cluster formations are distinct, and rendering performance remains smooth.

---

## 14. What Was NOT Changed

| Component | Status |
|-----------|--------|
| `use-knowledge-graph.ts` | **Modified only for demo scaling** — data fetching, caching, and state management remain completely unchanged |
| `renderers/types.ts` | **No changes** — pluggable renderer interface unchanged |
| `renderers/SigmaRenderer.tsx` | **No changes** — migration skeleton preserved |
| `/api/graph/route.ts` | **No changes** — API contract unchanged |
| `graph-service.ts` | **No changes** — DB schema/CRUD unchanged |
| `topic-extractor.ts` | **No changes** — AI topic extraction unchanged |
| `feedback-recorder.ts` | **No changes** — score update logic unchanged |
| Expand/collapse logic | **No changes** — `graphExpanded` state, toggle, overlay structure preserved |
| localStorage caching | **No changes** — 5-minute TTL, stale fallback preserved |

---

## 15. Library Decision

**Stayed with `react-force-graph-2d` v1.29.1.** No library migration.

Research confirmed:
- Obsidian's graph view uses Canvas + d3-force (same stack)
- All issues were configuration/rendering problems, not library limitations
- Sigma.js only necessary at 500+ nodes (our target: ≤200)
- No new dependencies added — collision force implemented inline

---

## 16. Performance & Obsidian Visual Overhaul (June 2026)

This section details the performance optimization, responsive layouts, search highlights, and advanced Obsidian-style visual enhancements implemented to make the knowledge graph feel incredibly smooth, interactive, and alive.

### Summary of Modifications

| Component / Feature | Previous Behavior | New Behavior | Rationale |
|---------------------|-------------------|--------------|-----------|
| **Hover State** | React state (`useState`) re-rendered the entire component on node hover, causing graph shimmering/flicker. | Ref-based hover tracking (`useRef`) with manual canvas redrawing. | **0 React re-renders on hover** for Butter-smooth canvas painting. |
| **Responsive Sizing** | Hardcoded canvas dimensions (`width={800}`, `height={600}`) that did not adapt to container. | Dynamic `ResizeObserver` tracking container dimension changes. | Re-calculates and resizes canvas elements to fit parent container automatically. |
| **Expanded Layout** | Flex container caused graph to use only ~50% of the expanded overlay viewport. | Absolute positioning (`absolute inset-0`) within a relative container wrapper. | Ensures the canvas fills **100% of the viewport width and height** when expanded. |
| **Search Filtering** | Nodes matching search were kept; all other nodes were filtered out, breaking the graph topology. | Highlight mode: non-matching nodes are dimmed to 10% opacity, keeping the entire graph visible. | Maintains structural context of the graph during node lookups. |
| **Layout Controls** | Radial and Tree button selectors that didn't work and caused physics instability. | Removed layout options; graph is consistently force-directed. | Avoids visual glitches and layout jumping from incompatible forces. |
| **Staggered Entrance Animation** | Nodes instantly appeared altogether in physical positions, feeling sudden. | Nodes scale up starting from the central system/hub node, radiating outwards in a ripple-like staggered wave. | **Obsidian-like progressive reveal** utilizing a lightweight elastic overshoot transition. |
| **Breathing & Floating Animation** | Nodes sat completely static unless dragged or physically simulated. | Continuous gentle floating position drift (+/-1.2px) and periodic node breathing (+/-4% radius) drawn on canvas. | Adds organic visual interest and an "alive" network feel with **zero physical simulation impact**. |
| **Zoom-Responsive Labels** | Fixed 11px font sizes only visible on hover/select. | Tooltips and font sizes scale inversely with the camera zoom level (`globalScale`). Labels automatically fade-in at high zooms. | Constant physical screen readability at all zoom levels, decluttering the view when zoomed out. |
| **Edge Entrance & Floating Alignment** | Edges were static and drew immediately even if endpoints hadn't animated in. | Edges fade/width-scale with endpoint entrance progress, and align perfectly to nodes' floating drift. | Prevents links from detaching from floating nodes or floating in empty space before nodes emerge. |
| **Physics Tuning** | `d3AlphaDecay` = 0.025, `d3VelocityDecay` = 0.35 | `d3AlphaDecay` = 0.028, `d3VelocityDecay` = 0.40 | Faster settlement, less drift, and smoother node dragging interaction. |
| **Node Detail Panel** | Appears instantly without transition. | Slide-in animation (`0.2s ease-out` from right/offset). | Provides a modern, premium UX transition matching other platforms (Obsidian/GitNexus). |

### Code Diffs & Configurations

#### Staggered Ripple Entrance (KnowledgeGraph.tsx)
```typescript
const getEntranceScale = useCallback((node: ForceGraphNode) => {
  const hubNode = nodes.find(n => n.nodeType === "system" || n.id === "demo:aria");
  let distance = 0;
  if (hubNode && hubNode.x !== undefined && hubNode.y !== undefined && node.x !== undefined && node.y !== undefined) {
    const dx = node.x - hubNode.x;
    const dy = node.y - hubNode.y;
    distance = Math.sqrt(dx * dx + dy * dy);
  } else {
    const index = nodes.findIndex(n => n.id === node.id);
    distance = index >= 0 ? index * 6 : 0;
  }
  
  const entranceDelay = Math.min(800, distance * 1.5);
  const entranceDuration = 500;
  const elapsed = Date.now() - animationStartTimeRef.current - entranceDelay;
  
  if (elapsed < 0) return 0;
  if (elapsed >= entranceDuration) return 1;
  const t = elapsed / entranceDuration;
  // Elastic overshoot curve
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}, [nodes]);
```

#### Gentle Breathing & Floating Visuals
```typescript
// Hash node ID to get a deterministic unique phase/frequency offset per node
const phaseOffset = node.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);

// Gentle breathing scale (varies +/- 4% over a 3.5s period)
const breathTime = (Date.now() * 0.0018) + phaseOffset;
const breathScale = 1 + 0.04 * Math.sin(breathTime);

// Floating offset (subtle drift, +/- 1.2px)
const floatTimeX = (Date.now() * 0.0006) + phaseOffset;
const floatTimeY = (Date.now() * 0.0008) + phaseOffset * 1.3;
const floatX = Math.sin(floatTimeX) * 1.2;
const floatY = Math.cos(floatTimeY) * 1.2;

const x = ((node.x as number) || 0) + floatX;
const y = ((node.y as number) || 0) + floatY;
```

#### Zoom-Responsive Label Scaling
```typescript
const isHighFreq = (node.frequency ?? 0) >= 3;
const shouldShowLabel =
  isHovered ||
  isSelected ||
  (globalScale > 1.1 && (isHighFreq || isAriaHub)) ||
  (globalScale > 1.8);

if (shouldShowLabel && entranceScale > 0.2) {
  const scaleFactor = 1 / globalScale;
  const fontSize = Math.max(5, Math.min(14, 10.5 * scaleFactor));
  ctx.font = `500 ${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
  // Pad and size elements inversely to globalScale to preserve physical pixel footprint
  const textY = y + drawR + 5 * scaleFactor;
  ...
}
```

---

## 17. Multi-Center Galaxy, BFS Reveal & Hover Animations (June 2026)

This section documents the layout, entrance, hover, and drag refinements that replaced the single-hub radial layout with an Obsidian-style multi-center galaxy, a true level-by-level reveal, animated link traces, and drag-consistent floating. **No architectural contracts (data model, API, caching, expand/collapse, hook signatures) were touched.**

### Summary of Modifications

| Component / Feature | Previous Behavior | New Behavior | Rationale |
|---------------------|-------------------|--------------|-----------|
| **Graph Layout** | Single `createRadialForce` pulled every node into one ring around the ARIA hub. | `createClusterForce` pins ARIA at center, promotes one **sub-hub per node type** onto an inner ring, and members orbit their category's sub-hub. | Multi-center "galaxy" with distinct regional clusters instead of one cramped ring — matches the multi-category demo and scales to 200 nodes. |
| **Sub-Hub Selection** | No concept of category representatives. | `pickSubHubs` elects the highest-frequency node of each non-system type as that cluster's anchor. | Deterministic, data-driven cluster anchors that survive re-renders. |
| **Member Distribution** | Hash-based `angle = phase % 360`, `radius = 28 + (phase % 32)` → severe overlap for 40–80-member clusters. | Spiral distribution: even angular spacing (`idx / count * 2π`) + multi-ring radii (`baseRing 26 + ring * 16`, `nodesPerRing` from arc length). | Scales with cluster size — a 79-member topic cluster spreads across multiple rings instead of collapsing onto one. |
| **Entrance Animation** | Distance-from-hub ripple (`Math.min(800, distance * 1.5)`). Reads as a single wave, not a progressive reveal. | BFS level from ARIA: `level 0 = hub`, `1 = direct neighbors`, `2 = next ring`… 180ms per level, capped at 1400ms, elastic ease. | True Obsidian-style progressive expansion: hub → first ring → second ring. |
| **Edge Entrance** | Edges drew immediately at full length even if endpoints hadn't appeared. | `drawPartialQuadBezier` draws only `linkEntrance` fraction of the curve; arrowhead renders only at `linkEntrance >= 1`. | Edges "reach out" toward nodes that haven't appeared yet, then complete as the deeper endpoint arrives. |
| **Hover: Link Animation** | Connected edges brightened to teal, static. | Connected edges animate with **flowing dashed teal** (`setLineDash([6,4])` + `lineDashOffset = -(now * 0.04) % 10`) + width boost. | Visible "signal flow" along relationships on hover, matching Obsidian's living-graph feel. |
| **Hover: Neighbor Labels** | Only the hovered/selected node's label appeared; connected neighbors stayed unlabeled. | `shouldShowLabel` now also fires for `isConnectedHovered || isConnectedSelected` — **every connected neighbor's label fades in**. | Lets users scan the full neighborhood without clicking each node. |
| **Label Alpha** | Focused and neighbor labels both at 0.92 alpha. | Focused node 0.92, connected neighbors 0.72 — subtle visual hierarchy. | Keeps the focused node prominent while still reading neighbors. |
| **Drag Consistency** | Floating drift (±1.2px) kept running during drag, making the dragged node feel "slippery". | `draggingNodeIdRef` set via `onNodeDrag`, cleared on `onNodeDragEnd`. `getNodeVisualPos` skips float/breathing for the dragged node only. | Dragged node tracks the cursor exactly while the rest of the graph keeps breathing. |
| **Link Endpoint Sync** | Link endpoints computed their own float offsets independently. | Both endpoints use `getNodeVisualPos` with the same `draggingNodeIdRef` — if an endpoint is being dragged, that end of the link stops floating too. | Links stay attached to the dragged node without rubber-banding. |
| **Sub-Hub Visuals** | N/A. | Sub-hubs get a 1.15× radius boost, a 1.35× glow ring, and a 0.8px `color@50%` border. | "Major center" nodes read as cluster anchors without overwhelming the ARIA hub. |
| **Cluster Spacing** | N/A (single ring). | Inner ring radius `max(110, minDim * 0.3)`; force strengths `subHub: 0.06`, `member: 0.012`. | Wider ring + softer member force lets the collision force spread dense 200-node clusters. |

### Architecture — What Stayed the Same

- `use-knowledge-graph.ts` **unchanged** (200-node generator, caching, filters all intact).
- `GraphControls.tsx`, `NodeDetail.tsx`, `page.tsx` **unchanged**.
- API route, graph-service, topic-extractor, feedback-recorder **unchanged**.
- Expand/collapse overlay, localStorage TTL, hook signatures **unchanged**.
- `react-force-graph-2d` v1.29.1 **still the only graph library** — no new dependencies.

### Code Diffs & Configurations

#### BFS Level Computation (replaces distance ripple)
```typescript
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
```

#### BFS-Based Entrance Scale (replaces distance-based)
```typescript
const getEntranceScale = useCallback((node: ForceGraphNode) => {
  const level = nodeLevelsRef.current.get(node.id) ?? 1;
  const levelDelay = 180;
  const entranceDuration = 450;
  const delay = Math.min(level * levelDelay, 1400);
  const elapsed = Date.now() - animationStartTimeRef.current - delay;

  if (elapsed < 0) return 0;
  if (elapsed >= entranceDuration) return 1;
  const t = elapsed / entranceDuration;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}, []);
```

#### Cluster Force (replaces radial force)
```typescript
function createClusterForce(configRef: { current: ClusterConfig }) {
  let nodes: ForceGraphNode[] = [];
  function force() {
    const cfg = configRef.current;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (const node of nodes) {
      if (node.id === cfg.hubId) {
        // ARIA pinned at (0, 0)
        node.vx += (0 - node.x) * cfg.strengths.hub;
        node.vy += (0 - node.y) * cfg.strengths.hub;
      } else if (cfg.subHubIds.has(node.id)) {
        // Sub-hub pulled to its ring slot
        const target = cfg.subHubTargets.get(node.id);
        node.vx += (target.x - node.x) * cfg.strengths.subHub;
        node.vy += (target.y - node.y) * cfg.strengths.subHub;
      } else {
        // Member pulled to its spiral slot around its sub-hub
        const myHub = nodeMap.get(cfg.nodeToHubId.get(node.id));
        const offset = cfg.nodeOffset.get(node.id);
        node.vx += (targetX - node.x) * cfg.strengths.member;
        node.vy += (targetY - node.y) * cfg.strengths.member;
      }
    }
  }
  return force;
}
```

#### Spiral Member Distribution (scales to 200 nodes)
```typescript
const nodesPerRing = Math.max(8, Math.floor((2 * Math.PI * baseRing) / 14));
const ring = Math.floor(idx / nodesPerRing);
const radius = baseRing + ring * ringSpacing;   // 26 + ring * 16
const angle = (idx / count) * 2 * Math.PI;
```

#### Hover: Animated Dashed Link Flow
```typescript
if (animated) {
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -(now * 0.04) % 10;
}
ctx.beginPath();
drawPartialQuadBezier(ctx, sx, sy, mx, my, tx, ty, linkEntrance);
ctx.stroke();
if (animated) {
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}
```

#### Hover: Neighbor Label Reveal
```typescript
const isFocused = isHovered || isSelected;
const isConnectedFocused = isConnectedHovered || isConnectedSelected;
const shouldShowLabel =
  isFocused ||
  isConnectedFocused ||           // NEW — neighbors' labels now appear
  (globalScale > 1.1 && (isHighFreq || isAriaHub)) ||
  (globalScale > 1.8);

const labelAlpha = isFocused ? 0.92 : 0.72;   // neighbors slightly dimmer
```

#### Drag: Pause Float on Dragged Node
```typescript
function getNodeVisualPos(node, draggingId, now) {
  const isDragging = node.id === draggingId;
  const floatX = isDragging ? 0 : Math.sin(now * 0.0006 + phase) * 1.2;
  const floatY = isDragging ? 0 : Math.cos(now * 0.0008 + phase * 1.3) * 1.2;
  const breathScale = isDragging ? 1 : 1 + 0.04 * Math.sin(now * 0.0018 + phase);
  return { x: node.x + floatX, y: node.y + floatY, breathScale };
}

// Wired via:
onNodeDrag={(node) => { draggingNodeIdRef.current = node.id; }}
onNodeDragEnd={() => { draggingNodeIdRef.current = null; }}
```

#### Partial Bezier Draw-On (edge entrance)
```typescript
function drawPartialQuadBezier(ctx, sx, sy, mx, my, tx, ty, fraction) {
  if (fraction >= 1) {
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, my, tx, ty);
    return;
  }
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
```

### Force Strength Reference

| Force | Target | Strength | Purpose |
|-------|--------|----------|---------|
| `hub` | ARIA → (0, 0) | 0.35 | Pin the system hub at the canvas center |
| `subHub` | Sub-hub → ring slot | 0.06 | Hold category anchors on the inner ring |
| `member` | Member → spiral slot | 0.012 | Gentle pull to cluster around its sub-hub |
| `collide` | All pairs | 0.7 | Prevent overlap (radius + 6px padding) |
| `charge` | All nodes | -280, distanceMax 250 | Repulsion between unrelated nodes |
| `link` | Connected pairs | distance 160 | Edge-length target |

### Why This Reads as "Obsidian-like"

1. **Multi-center, not single-center** — categories form their own neighborhoods instead of one undifferentiated ring.
2. **Level-by-level reveal** — hub appears, then its direct neighbors, then *their* neighbors; edges draw outward as the deeper node arrives.
3. **Living hover** — connected links show directional flow; the whole neighborhood's labels appear at once so you can scan relationships without clicking.
4. **Stable drag** — the node you grab stays exactly under the cursor; the rest of the graph keeps its subtle breathing.


