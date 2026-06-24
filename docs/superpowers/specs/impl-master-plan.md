# Implementation Master Plan

**Date:** 2026-06-22
**Source spec:** `2026-06-22-tool-persistence-and-premium-glass-ui-design.md`
**Status:** In progress

---

## What's Already Done

These were implemented in prior sessions and verified in the codebase:

- [x] **Spec 1 (UI Overlap):** GraphControls at `top-14`, NodeDetail at `bottom-4` + `max-w`, single toolbar row
- [x] **Spec 1 (History title-only):** Answer preview removed from ChatHistory items
- [x] **Glass tokens:** `--aria-glass-border`, `.aria-glass-float`, `.aria-msg-in` added to `globals.css`
- [x] **Canonical types:** `SerializablePart` + `StoredMessage` added to `packages/ai-ui/src/lib/types.ts`

## What Remains

Three implementation goals, each with its own plan file:

| # | Goal | Plan file | Files | Est. lines |
|---|------|-----------|-------|------------|
| 1 | Tool persistence core | `impl-1-tool-persistence.md` | 4 | ~100 |
| 2 | History sidebar polish | `impl-2-history-polish.md` | 1 | ~80 |
| 3 | Glassmorphism UI pass | `impl-3-glass-ui.md` | 7 | ~150 |

**Execution order:** Goal 1 first (highest value — fixes the actual bug), then Goal 2, then Goal 3 (visual polish on top).

## Goals at a Glance

### Goal 1: Tool Persistence Core
Capture reasoning + tool-call parts from the Mastra stream server-side, persist them alongside plain text, and reconstruct them client-side so the ChainOfThought accordion renders identically on history reload.

### Goal 2: History Sidebar Polish
Add deterministic title formatting (first sentence, strip greetings, 48-char cap) and date-bucket grouping (Today / Yesterday / Previous 7 Days / Older) with section headers.

### Goal 3: Glassmorphism UI Pass
Apply the 3-tier glass hierarchy (`aria-glass` / `aria-glass-strong` / `aria-glass-float`) across all surfaces, refresh chat avatars/bubbles, glass the ChainOfThought accordion, and apply the `aria-msg-in` entrance animation.

---

## Files Touched (all goals combined)

| File | Goal | Change |
|------|------|--------|
| `apps/web/lib/mastra-client.ts` | 1 | Add `PartAccumulator` class; widen `onFinish` to `{ assistantText, parts }` |
| `apps/web/app/api/chat/route.ts` | 1 | Pass `parts` into assistant `StoredMessage` |
| `packages/ai-ui/src/components/llm/agent-chat.tsx` | 1, 3 | Read `msg.parts` in `storedMessageToUIMessage`; glass surfaces; `aria-msg-in` on rows; avatar/bubble refresh |
| `apps/web/lib/chat-history-store.ts` | 1 | Import canonical `StoredMessage` from `@repo/ai-ui/lib/types`, remove local dup |
| `packages/ai-ui/src/components/history/ChatHistory.tsx` | 2 | `formatThreadTitle` + `formatDateGroup` + bucketed rendering; glass container |
| `apps/web/app/globals.css` | ✅ | Already has tokens (no further changes) |
| `packages/ai-ui/src/lib/types.ts` | ✅ | Already has types (no further changes) |
| `packages/ai-ui/src/components/graph/KnowledgeGraph.tsx` | 3 | Glass tab; glass summary; slight canvas wash strengthen |
| `packages/ai-ui/src/components/graph/GraphControls.tsx` | 3 | `aria-glass-float` on toolbar + settings panel |
| `packages/ai-ui/src/components/graph/NodeDetail.tsx` | 3 | Unify to `aria-glass-float` |
| `packages/ai-ui/src/components/ai-elements/tool.tsx` | 3 | `Tool` card → `aria-glass-float` |
| `apps/web/app/page.tsx` | 3 | Header gradient; panel surfaces → glass |

**Total:** 12 files across 3 goals. Core persistence is ~60 new lines (one class) + ~10 lines wiring. The rest is the visual pass.
