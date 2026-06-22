# UI Overlap & Chat History Fixes

**Date:** 2026-06-22
**Status:** Approved (Approach B)
**Scope:** Three targeted fixes in `packages/ai-ui/`

---

## Problem Summary

1. **Chat history sidebar** shows the assistant's answer under each title. Should show title only (ChatGPT-style).
2. **Knowledge graph** has four absolutely-positioned UI layers overlapping in the narrow sidebar (~220-320px): the centered tab, GraphControls, NodeDetail (`w-72` = 288px), and the summary box.
3. **Search/Filter/Demo/Fit controls** wrap and collide with the tab on narrow widths because they sit at `top-2` while the tab sits at `top-3`.

---

## Fix 1 — Chat History: Title Only

**File:** `packages/ai-ui/src/components/history/ChatHistory.tsx`
**Change:** Delete lines 281-288 (the `{result ? <p className="line-clamp-2 ...">{result.replace(/[#*`]/g, "").trim()}</p> : null}` block).

Each item renders:
- Title (user's question), single line, truncated
- Meta row (message count, feedback count, relative time)

No answer preview. `lastResult` stays in the data type for potential future use but is not rendered.

**Diff size:** -8 lines, +0 lines.

---

## Fix 2 — Knowledge Graph: Reposition Overlapping Layers

**Files:**
- `packages/ai-ui/src/components/graph/KnowledgeGraph.tsx`
- `packages/ai-ui/src/components/graph/NodeDetail.tsx`

### Layer repositioning

| Layer | Before | After |
|-------|--------|-------|
| Segmented tab | `top-3` centered, z-20 | unchanged |
| GraphControls | `left-2 top-2` z-10 | `left-2 top-14` z-10 (below the tab) |
| NodeDetail | `right-4 top-4` w-72 z-10 | `right-4 bottom-4` w-72 z-10 (bottom-right) |
| Summary | `bottom-4 left-4` | unchanged (NodeDetail moved away from it) |

Rationale: the tab stays at the top. Controls drop below it so they never collide. NodeDetail moves to bottom-right so it never overlaps the search box or the tab. Summary stays bottom-left; NodeDetail is bottom-right — opposite corners.

### NodeDetail width guard

In the narrow sidebar (~220-320px), `w-72` (288px) overflows. Add `max-w-[calc(100%-2rem)]` so it shrinks to fit the container instead of overflowing.

---

## Fix 3 — Controls: Single Toolbar Row

**File:** `packages/ai-ui/src/components/graph/GraphControls.tsx`

**Before:** Two rows —
- Row 1 (`flex flex-wrap`): search, settings, demo, loader
- Row 2 (`flex`): zoom-out, fit, zoom-in

**After:** One row — `flex items-center gap-1`, no wrap:
- Search (flex-1, min-w-0 so it shrinks instead of pushing others off)
- Settings button
- Demo button
- Loader (if loading)
- Divider (1px vertical, h-4, subtle border)
- Zoom-out, Fit, Zoom-in

This removes the second row entirely. All controls align on one horizontal line, below the tab. Works in both narrow sidebar and expanded overlay.

### Search input width

`w-20 sm:w-32` → `flex-1 min-w-0`. The search box absorbs available space and never forces wrapping.

### Settings panel position

The filter/physics panel (`showFilters`) still drops below the toolbar row. With the toolbar at `top-14`, the panel appears at ~`top-24` — clear of the tab.

---

## What's NOT Changing

- Data flow (lastQuery/lastResult stored server-side) — unchanged.
- Graph rendering logic (ForceGraph2D, node canvas objects) — unchanged.
- Filter/physics panel contents — unchanged.
- Tab behavior (Exploration/Preferences/Both) — unchanged.
- Summary box content/position — unchanged.

---

## Files Touched

| File | Change |
|------|--------|
| `packages/ai-ui/src/components/history/ChatHistory.tsx` | Delete answer-preview block (8 lines) |
| `packages/ai-ui/src/components/graph/GraphControls.tsx` | Merge zoom row into toolbar row, fix search width, remove `flex-wrap` |
| `packages/ai-ui/src/components/graph/KnowledgeGraph.tsx` | Move GraphControls from `top-2` to `top-14` |
| `packages/ai-ui/src/components/graph/NodeDetail.tsx` | Move from `top-4` to `bottom-4`, add `max-w-[calc(100%-2rem)]` |

**Total:** ~4 files, ~20 lines changed.
