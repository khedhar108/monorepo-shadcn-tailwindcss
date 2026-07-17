# Feedback ↔ Preference Graph Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire feedback into the knowledge graph so rating a message creates preference-to-topic edges, make the FeedbackBar submit hybrid (auto on thumbs/stars, explicit for notes), and stop the graph panel collapsing to 0 nodes on an empty DB.

**Architecture:** Three independent changes. Change A (client) rewrites FeedbackBar's submit behavior. Change B (agent/DB) adds a thread-topic lookup query and extends `upsertPreferenceNode` to create preference edges to those topics, wired through `feedback-recorder`. Change C (client) fixes the demo-fallback boolean in `use-knowledge-graph`. They share no code and can land in any order.

**Tech Stack:** Next.js (apps/web), Mastra tools (apps/agent), libsql/SQLite graph tables, React hook (`packages/ai-ui`).

**Verification note:** This repo has **no test runner** (no vitest/jest in agent, web, or ai-ui — only `check-types` and `lint`). Adding a test framework is out of scope for this MVP fix. Each task verifies with `check-types`, `lint`, and a manual browser check against the spec's checklist (see spec `2026-06-24-feedback-preference-linkage-design.md`). Commits land per task.

---

## File Structure

| Change | File | Responsibility |
|--------|------|----------------|
| A | `packages/ai-ui/src/components/chat/FeedbackBar.tsx` | Hybrid submit: debounced auto-submit on thumbs/stars; explicit Submit only in note panel |
| B | `apps/agent/src/mastra/db/graph-service.ts` | NEW `getThreadTopicNodeIds`; extend `upsertPreferenceNode` to create topic edges |
| B | `apps/agent/src/mastra/tools/feedback-recorder.ts` | Resolve thread topics, pass to preference upsert, fix rescore target |
| C | `packages/ai-ui/src/hooks/use-knowledge-graph.ts` | Reset `hasRealData=false` on empty fetch so demo stays until real rows exist |

No new files, no schema migration (`graph_node_messages`, `graph_nodes`, `graph_edges`, `preference` edge type all exist already).

---

## Task 1: Add `getThreadTopicNodeIds` query (Change B1)

**Files:**
- Modify: `apps/agent/src/mastra/db/graph-service.ts` (add after `getRecentNodeIds`, ~line 282)

- [ ] **Step 1: Add the new exported function**

Insert immediately after the closing brace of `getRecentNodeIds` (after line 282):

```ts
export async function getThreadTopicNodeIds(
  userId: string,
  threadId: string,
  limit = 8,
): Promise<string[]> {
  await ensureGraphSchema();

  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT DISTINCT gn.id AS id
          FROM graph_nodes gn
          INNER JOIN graph_node_messages gnm ON gnm.node_id = gn.id
          WHERE gn.user_id = ?
            AND gnm.thread_id = ?
            AND gn.graph_kind = 'exploration'
          ORDER BY gn.last_seen DESC
          LIMIT ?`,
    args: [userId, threadId, limit],
  });

  return result.rows.map((row) => String((row as Record<string, unknown>).id));
}
```

- [ ] **Step 2: Type-check the agent package**

Run: `pnpm --filter agent check-types`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/mastra/db/graph-service.ts
git commit -m "feat(graph): add getThreadTopicNodeIds thread-recency topic lookup"
```

---

## Task 2: Extend `upsertPreferenceNode` with topic edges (Change B2)

**Files:**
- Modify: `apps/agent/src/mastra/db/graph-service.ts:373` (replace the whole `upsertPreferenceNode` function)

- [ ] **Step 1: Replace `upsertPreferenceNode` with the extended version**

Replace the entire function (currently lines 373-423) with:

```ts
export async function upsertPreferenceNode(input: {
  userId: string;
  label: string;
  score?: number;
  source?: string;
  threadId?: string;
  topicNodeIds?: string[];
}): Promise<GraphNode> {
  await ensureGraphSchema();

  const db = getDbClient();
  const hub = await getUserHub(input.userId);
  const prefId = buildNodeId(input.userId, input.label);
  const score = input.score ?? 0.5;
  const metadata = input.source ? JSON.stringify({ source: input.source }) : null;

  await db.execute({
    sql: `INSERT INTO graph_nodes (
      id, user_id, label, node_type, graph_kind, frequency, avg_score, first_seen, last_seen, metadata
    ) VALUES (?, ?, ?, 'preference', 'preference', 1, ?, datetime('now'), datetime('now'), ?)
    ON CONFLICT(id) DO UPDATE SET
      frequency = frequency + 1,
      last_seen = datetime('now'),
      avg_score = ROUND((avg_score + ?) / 2.0, 4),
      metadata = COALESCE(excluded.metadata, graph_nodes.metadata)`,
    args: [prefId, input.userId, input.label.trim(), score, metadata, score],
  });

  // Edge from USER hub to this preference node (existing behavior)
  const [hubLeft, hubRight] = hub.id < prefId ? [hub.id, prefId] : [prefId, hub.id];
  const hubEdgeId = `${hubLeft}:${hubRight}:preference`;

  await db.execute({
    sql: `INSERT INTO graph_edges (
      id, user_id, source_id, target_id, edge_type, weight, created_at
    ) VALUES (?, ?, ?, ?, 'preference', 1.0, datetime('now'))
    ON CONFLICT(source_id, target_id, edge_type) DO UPDATE SET
      weight = weight + 1.0`,
    args: [hubEdgeId, input.userId, hub.id, prefId, 'preference'],
  });

  // NEW: edges from this preference node to each exploration topic of the rated message.
  // This is the missing link: preferences now connect to what the user was discussing.
  const topicNodeIds = input.topicNodeIds ?? [];
  for (const topicId of topicNodeIds) {
    if (topicId === prefId) continue;
    const [left, right] = prefId < topicId ? [prefId, topicId] : [topicId, prefId];
    const edgeId = `${left}:${right}:preference`;

    await db.execute({
      sql: `INSERT INTO graph_edges (
        id, user_id, source_id, target_id, edge_type, weight, created_at
      ) VALUES (?, ?, ?, ?, 'preference', 1.0, datetime('now'))
      ON CONFLICT(source_id, target_id, edge_type) DO UPDATE SET
        weight = weight + 1.0`,
      args: [edgeId, input.userId, prefId, topicId, 'preference'],
    });
  }

  const result = await db.execute({
    sql: `SELECT * FROM graph_nodes WHERE id = ?`,
    args: [prefId],
  });

  const row = result.rows[0];
  if (!row) {
    throw new Error(`Failed to upsert preference node: ${input.label}`);
  }

  return mapNodeRow(row as Record<string, unknown>);
}
```

Note: the only behavioral additions vs. the old function are (a) the two new optional input fields and (b) the `topicNodeIds` edge-creation loop. Old callers that pass no `topicNodeIds` get identical behavior to before.

- [ ] **Step 2: Type-check the agent package**

Run: `pnpm --filter agent check-types`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/mastra/db/graph-service.ts
git commit -m "feat(graph): upsertPreferenceNode wires edges to rated message topics"
```

---

## Task 3: Wire topic resolution + fixed rescore through `feedback-recorder` (Change B3)

**Files:**
- Modify: `apps/agent/src/mastra/tools/feedback-recorder.ts`

- [ ] **Step 1: Add `getThreadTopicNodeIds` to the imports**

Replace the import block (lines 3-8):

```ts
import {
  getRecentNodeIds,
  getThreadTopicNodeIds,
  recordFeedback,
  updateNodeScores,
  upsertPreferenceNode,
} from '../db/graph-service';
```

- [ ] **Step 2: Replace the `execute` body to resolve topics + fix rescore**

Replace the entire `execute` arrow function (currently lines 39-101) with:

```ts
  execute: async (input, context) => {
    const userId =
      input.userId ?? requestContextValue(context, 'userId') ?? 'global';
    const threadId =
      input.threadId ?? requestContextValue(context, 'threadId') ?? 'anonymous-thread';
    const score = computeFeedbackScore(input);
    const feedbackId = `${threadId}:${input.messageId}:${Date.now()}`;

    // 1) Record raw feedback
    await recordFeedback({
      id: feedbackId,
      userId,
      messageId: input.messageId,
      threadId,
      thumbs: input.thumbs,
      rating: input.rating,
      comment: input.comment,
      score,
    });

    // 2) Resolve the exploration topics most recently associated with this thread
    //    (Approach 1: thread-recency — no message-ID alignment needed).
    let topicNodeIds: string[] = [];
    try {
      topicNodeIds = await getThreadTopicNodeIds(userId, threadId);
    } catch (error) {
      console.error('[feedback-recorder] thread topic lookup failed:', error);
    }

    // 3) Derive a preference label and upsert a preference node wired to those topics
    let preferenceLabel: string | null = null;
    try {
      const derived = derivePreferenceLabel({
        thumbs: input.thumbs,
        rating: input.rating,
        comment: input.comment,
      });

      if (derived) {
        preferenceLabel = derived.label;
        await upsertPreferenceNode({
          userId,
          label: derived.label,
          score,
          source: 'feedback',
          threadId,
          topicNodeIds,
        });
      }
    } catch (error) {
      console.error('[feedback-recorder] preference derivation failed:', error);
    }

    // 4) Rescore: prefer the rated message's topics, then caller-supplied nodeIds,
    //    then fall back to generic recency. Fixes spec gap #3 (wrong nodes rescored).
    const updatedNodeIds =
      topicNodeIds.length > 0
        ? topicNodeIds
        : input.nodeIds && input.nodeIds.length > 0
          ? input.nodeIds
          : await getRecentNodeIds(userId);

    await updateNodeScores(updatedNodeIds, score);

    return {
      score,
      updatedNodeIds,
      preferenceLabel,
      message:
        preferenceLabel
          ? `Feedback recorded. Saved preference: ${preferenceLabel}.`
          : updatedNodeIds.length > 0
            ? 'Feedback recorded and graph scores updated.'
            : 'Feedback recorded. No graph nodes were available to update yet.',
    };
  },
```

- [ ] **Step 3: Type-check the agent package**

Run: `pnpm --filter agent check-types`
Expected: PASS, no errors.

- [ ] **Step 4: Manual check — preference edges appear**

In a running dev session (agent + web):
1. Send a substantive chat message so topics are extracted (e.g. "Explain React hooks").
2. Open the graph panel → confirm exploration nodes exist for the thread.
3. Rate the assistant reply with 👍.
4. Open the graph panel "Preferences" or "Both" tab → confirm a preference node appears with edges to the topic nodes (not just the USER hub).
5. Check the toast reads the correct rescored node count.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/mastra/tools/feedback-recorder.ts
git commit -m "feat(feedback): resolve thread topics and rescore the right nodes"
```

---

## Task 4: Hybrid submit in FeedbackBar (Change A)

**Files:**
- Modify: `packages/ai-ui/src/components/chat/FeedbackBar.tsx`

- [ ] **Step 1: Add the debounce ref + unmount cleanup**

Replace the import line (line 4):

```ts
import { useEffect, useMemo, useRef, useState } from "react";
```

Replace the state block (lines 35-42) — add the ref right after it (after line 42, before `canSubmit`):

```ts
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending auto-submit when the bar unmounts.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);
```

- [ ] **Step 2: Add `clearPendingSubmit` + `scheduleAutoSubmit` helpers**

Insert these immediately before `handleSubmit` (before line 49):

```ts
  function clearPendingSubmit() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }

  // Thumbs/stars auto-submit after a short debounce — but only when the note
  // panel is closed (an open note is submitted deliberately via its button).
  function scheduleAutoSubmit() {
    if (expanded || submitted || disabled) return;
    clearPendingSubmit();
    debounceRef.current = setTimeout(() => void handleSubmit(), 600);
  }
```

- [ ] **Step 3: Cancel pending submit inside `handleSubmit`**

Replace the first two lines of `handleSubmit` (lines 50-52):

```ts
  async function handleSubmit() {
    clearPendingSubmit();
    if (!canSubmit || disabled || isSubmitting) {
      return;
    }
```

- [ ] **Step 4: Wire thumbs-up button to auto-submit**

Replace the thumbs-up button's `onClick` (line 109):

```tsx
          onClick={() => {
            setThumbs(thumbs === "up" ? undefined : "up");
            scheduleAutoSubmit();
          }}
```

- [ ] **Step 5: Wire thumbs-down button to auto-submit**

Replace the thumbs-down button's `onClick` (line 123):

```tsx
          onClick={() => {
            setThumbs(thumbs === "down" ? undefined : "down");
            scheduleAutoSubmit();
          }}
```

- [ ] **Step 6: Wire each star button to auto-submit**

Replace the star button's `onClick` (line 142):

```tsx
                onClick={() => {
                  setRating(rating === value ? undefined : value);
                  scheduleAutoSubmit();
                }}
```

- [ ] **Step 7: Cancel pending submit when toggling the note panel**

Replace the Note button's `onClick` (line 159):

```tsx
          onClick={() => {
            clearPendingSubmit();
            setExpanded((value) => !value);
          }}
```

- [ ] **Step 8: Remove the standalone "Apply" button**

Delete the entire "Apply" button block (lines 165-172):

```tsx
        <button
          type="button"
          disabled={!canSubmit || disabled || isSubmitting}
          onClick={() => void handleSubmit()}
          className="ml-auto rounded-full bg-neutral-950 px-3 py-1 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white"
        >
          {isSubmitting ? "Saving..." : "Apply"}
        </button>
```

The note panel's explicit "Submit" button (lines 183-190) stays as the only deliberate submit affordance.

- [ ] **Step 9: Type-check + lint the ai-ui package**

Run: `pnpm --filter @repo/ai-ui check-types`
Expected: PASS, no errors.

Run: `pnpm --filter @repo/ai-ui lint`
Expected: PASS (no new warnings).

- [ ] **Step 10: Manual check — hybrid submit behavior**

In the running web app:
1. Send a chat message.
2. Click 👍 on the reply → after ~600ms the "Saved" pill appears with NO button press.
3. Click a star → again auto-saves after ~600ms.
4. Click "Note" → type half a sentence → confirm it does NOT auto-save.
5. Click "Submit" in the note panel → saves thumbs + stars + note together.
6. Open the note, start typing, then click 👍 → confirm no premature save; explicit Submit still wins.

- [ ] **Step 11: Commit**

```bash
git add packages/ai-ui/src/components/chat/FeedbackBar.tsx
git commit -m "feat(feedback): hybrid submit — auto on thumbs/stars, explicit for notes"
```

---

## Task 5: Fix demo-fallback logic (Change C)

**Files:**
- Modify: `packages/ai-ui/src/hooks/use-knowledge-graph.ts:383-386`

- [ ] **Step 1: Reset `hasRealData` when a fetch returns no nodes**

Replace lines 383-386:

```ts
      const result: GraphData = await response.json();
      if (result.nodes.length > 0) {
        setHasRealData(true);
      }
      setData(result);
```

with:

```ts
      const result: GraphData = await response.json();
      if (result.nodes.length > 0) {
        setHasRealData(true);
      } else {
        // An empty DB genuinely has no real data — re-enable the demo fallback
        // so the panel never collapses to 0 nodes for a fresh/empty user.
        setHasRealData(false);
      }
      setData(result);
```

`showDefaultDemo` (line 415) is unchanged — with this reset it now correctly means "no real data yet AND current data empty AND not demo mode → show the 3 demo nodes."

- [ ] **Step 2: Type-check + lint the ai-ui package**

Run: `pnpm --filter @repo/ai-ui check-types`
Expected: PASS.

Run: `pnpm --filter @repo/ai-ui lint`
Expected: PASS.

- [ ] **Step 3: Manual check — demo stays on empty DB**

1. With a fresh/empty graph DB (new user or cleared tables), open the app.
2. Confirm the graph panel shows the 3 demo nodes (not blank).
3. Send a substantive message so topics get extracted.
4. Confirm real exploration nodes replace the demo.
5. (Optional) Switch the graph filter so the query returns empty again — the demo reappears rather than going to 0 nodes.

- [ ] **Step 4: Commit**

```bash
git add packages/ai-ui/src/hooks/use-knowledge-graph.ts
git commit -m "fix(graph): keep demo fallback until real nodes exist in DB"
```

---

## Task 6: Full end-to-end verification

- [ ] **Step 1: Type-check the whole monorepo**

Run: `pnpm check-types` (or `pnpm -r check-types`)
Expected: PASS across all packages.

- [ ] **Step 2: Lint the whole monorepo**

Run: `pnpm -r lint`
Expected: PASS across all packages.

- [ ] **Step 3: Run the spec's verification checklist**

From `2026-06-24-feedback-preference-linkage-design.md` → Testing section:

- After a substantive chat turn: 2–5 exploration nodes appear, connected by co_occurrence edges.
- Rate an answer (thumbs + stars): a preference node appears wired to that turn's topic nodes, not just the hub.
- Graph panel never shows 0 nodes for an empty DB — demo stays until real rows exist.
- Thumbs/stars auto-submit (~600ms); note Submit is deliberate.

- [ ] **Step 4: Final commit if any incidental fixes were needed** (otherwise skip)

---

## Self-Review

**Spec coverage:**
- Hybrid submit (Decision 1 / Change A) → Task 4. ✓
- Preference→topic edges (Decision 2 / Change B) → Tasks 1-3 (B1 query, B2 upsert, B3 wire-through). ✓
- Demo-fallback fix (Decision 3 / Change C) → Task 5. ✓
- Approach 1 thread-recency (Decision 4) → `getThreadTopicNodeIds` in Task 1. ✓
- Spec gap #3 (wrong nodes rescored) → fixed in Task 3 Step 2 (rescore uses `topicNodeIds`). ✓
- Error handling (fallback to `getRecentNodeIds` when no thread topics) → Task 3 Step 2. ✓

**Placeholder scan:** No TBD/TODO. Every step shows the exact code or exact command. Manual-check steps name the specific behavior to observe. ✓

**Type consistency:** `getThreadTopicNodeIds(userId, threadId, limit=8)` signature in Task 1 matches its call in Task 3 (`getThreadTopicNodeIds(userId, threadId)`). `upsertPreferenceNode` input adds `threadId?` + `topicNodeIds?` in Task 2, and Task 3 passes exactly those. `scheduleAutoSubmit`/`clearPendingSubmit`/`debounceRef` names are consistent across all of Task 4's steps. ✓
