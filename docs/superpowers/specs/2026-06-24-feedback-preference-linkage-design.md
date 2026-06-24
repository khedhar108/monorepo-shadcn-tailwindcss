# Feedback ↔ Preference Graph Linkage — Design

> Companion to `2026-06-24-feedback-preference-linkage-understanding.md`.
> This spec records the approved design. Implementation plan follows.

## Decisions (from brainstorming)

| # | Question | Decision |
|---|----------|----------|
| 1 | Submit UX | **Hybrid** — thumbs/stars auto-submit (debounced); explicit Submit button only inside the note panel |
| 2 | Preference edges | **Link to message topics** — preference nodes connect to the exploration topics of the rated message |
| 3 | Graph 0-nodes | **Fix demo-fallback logic only** — keep the 3-node demo until real DB rows exist |
| 4 | Linkage mechanism | **Approach 1: thread-recency resolution** — look up the most recent exploration nodes in the rated message's thread; no message-ID alignment work |

## Scope

**In scope:** three broken behaviors in the feedback→graph path:
1. Hybrid submit UX for `FeedbackBar`.
2. Preference nodes get edges to the rated message's exploration topics.
3. Graph panel no longer collapses to 0 nodes for an empty DB.

**Out of scope:** model picker popup, changing topic extraction logic, fixing the client/server message-ID alignment (Approach 1 sidesteps it).

## Architecture — three independent changes

```
CHANGE A (client/UI)  : FeedbackBar hybrid submit
CHANGE B (agent/DB)   : preference → topic edges
CHANGE C (client/UI)  : demo-fallback logic fix
```

A and C are pure client/UI. B is pure agent/DB. They share no code, can be built and tested independently, and can be merged in any order.

---

## Change A — Hybrid submit (`packages/ai-ui/src/components/chat/FeedbackBar.tsx`)

### Current behavior
- `canSubmit` becomes true on any input.
- A static "Apply" button (`:165-172`) always shows.
- A second "Submit" button (`:183-190`) shows inside the expanded note panel.

### New behavior
- **Thumbs / stars:** on any change, start a **600ms debounce**. When it fires, auto-submit (call `onSubmit`). Reset the timer if the user changes again mid-debounce. Show a subtle "saving…" state while submitting, then the existing "Saved" pill.
- **Note panel (expanded):** the textarea + explicit **Submit** button stays. Typing does NOT auto-submit (half-typed notes should not be saved). The note's Submit is the only deliberate submit affordance.
- **Remove** the standalone "Apply" button (`:165-172`).
- **Edge case:** if a note is open and being typed while a thumbs/star debounce is pending, the explicit Submit wins (submits thumbs + stars + note together); cancel any pending auto-submit debounce on manual submit.

### State additions
- A debounce timer ref (`useRef<ReturnType<typeof setTimeout>>`).
- Cleanup the timer on unmount.

The `submitted` success pill stays as-is.

---

## Change B — Preference → topic edges (the core fix)

### B1. New query: `getThreadTopicNodeIds` (`apps/agent/src/mastra/db/graph-service.ts`)

```ts
getThreadTopicNodeIds(userId: string, threadId: string, limit = 8): Promise<string[]>
```

Returns the **exploration node IDs most recently associated with a thread.** Joins `graph_node_messages` (which already stamps `message_id` + `thread_id` on every node during extraction, see `upsertNodes` `:137-143`) to `graph_nodes`, filters `graph_kind = 'exploration'`, orders by `graph_nodes.last_seen` DESC, returns **distinct** node IDs up to `limit`.

This is Approach 1 — recency-within-thread resolution. Correct in the common case (the user rates the message they just received), with no ID-alignment work. Empty result when the thread has no extracted topics yet.

### B2. Rewrite `upsertPreferenceNode` (`graph-service.ts:373`)

Extend its input:
```ts
upsertPreferenceNode(input: {
  userId: string;
  label: string;
  score?: number;
  source?: string;
  threadId?: string;          // NEW
  topicNodeIds?: string[];    // NEW
}): Promise<GraphNode>
```

Behavior after creating the preference node + USER-hub edge (unchanged existing logic):
- For each id in `topicNodeIds`, create a `preference`-typed edge between the preference node and that topic node (same upsert pattern as the hub edge: `ON CONFLICT DO UPDATE weight = weight + 1`).
- If `topicNodeIds` is empty/missing → fall back to current hub-only behavior (no regression for old callers).

`preference` is already a valid `edge_type` (`graph-service.ts:5`). No schema migration needed.

**Result:** rating a message about "React hooks" wires the preference node (e.g. `concise answers`) to the React-hooks topic node. Feedback now shapes the knowledge graph.

### B3. Wire through `feedback-recorder` (`apps/agent/src/mastra/tools/feedback-recorder.ts`)

In `execute`:
1. Resolve `topicNodeIds` via `getThreadTopicNodeIds(userId, threadId)` when `threadId` is present; otherwise `[]`.
2. Pass `threadId` + `topicNodeIds` into `upsertPreferenceNode`.
3. **Fix score rescore (spec gap #3):** use `topicNodeIds` for `updateNodeScores` when non-empty; otherwise fall back to `getRecentNodeIds(userId)` (no regression). The score now lands on the rated message's topics instead of generic most-recent nodes.
4. Return `updatedNodeIds` = the topic node IDs actually rescored (so the toast reports the correct count).

`feedback-recorder.ts:77-79` already wraps derivation in try/catch; a failure still records raw feedback. Unchanged.

---

## Change C — Demo-fallback fix (`packages/ai-ui/src/hooks/use-knowledge-graph.ts`)

### Current bug (`:384-386`)
```ts
const result: GraphData = await response.json();
if (result.nodes.length > 0) {
  setHasRealData(true);   // flips true, but an empty response never resets to false
}
setData(result);
```
Combined with `:415`:
```ts
const showDefaultDemo = !hasRealData && data.nodes.length === 0 && !demoMode;
```
Once `hasRealData` is true (populated cache) OR an empty `setData` follows any prior data, the demo disappears — producing the reported 0-node panel.

### Fix (minimal)
1. Keep `setHasRealData(true)` when `result.nodes.length > 0`.
2. **Add** `setHasRealData(false)` whenever a fetch returns `result.nodes.length === 0`. A genuinely empty DB now correctly re-enables the demo.
3. `showDefaultDemo` logic stays — with the reset, it correctly means "no real data yet AND current data empty AND not in demo mode → show 3 demo nodes."

Net effect: a brand-new user sees 3 demo nodes; once they chat and topics land in the DB, real nodes replace the demo; if the DB is empty, the demo stays instead of going blank.

---

## Data flow summary

```
User rates message (thumbs / stars)
  → FeedbackBar: debounce 600ms → submitFeedback(payload)
  → POST /api/feedback
  → feedback-recorder tool:
      1. recordFeedback (raw row)                         [unchanged]
      2. derivePreferenceLabel (note text → label)        [unchanged]
      3. getThreadTopicNodeIds(userId, threadId)          [NEW]
      4. upsertPreferenceNode({threadId, topicNodeIds})   [NEW edges to topics]
      5. updateNodeScores(topicNodeIds, score)            [FIXED target]
  → returns preferenceLabel, updatedNodeIds
  → toast: "Graph modified · preference '…' added · N node(s) rescored"
  → onFeedbackSubmitted → graph refetch → preference node + topic edges visible
```

## Error handling

- **B, no thread topics found:** fall back to hub-only edge + `getRecentNodeIds` rescoring (current behavior). No error thrown — preferences still record.
- **B, `upsertPreferenceNode` throws:** already wrapped in try/catch (`feedback-recorder.ts:77-79`), logged, feedback still recorded. Unchanged.
- **A, auto-submit network failure:** show existing error state + toast; no auto-retry. The user can tap thumbs again or open a note.
- **C:** pure logic change, no new failure modes.

## Testing

Manual verification against the understanding doc's checklist (no test infra exists for these layers currently):
- After a substantive chat turn: 2–5 exploration nodes appear, connected by co_occurrence edges. (Already works; Change C makes them reliably visible.)
- Rate an answer (thumbs + stars): a preference node appears wired to that turn's topic nodes, not just the hub.
- Graph panel never shows 0 nodes for an empty DB — demo stays until real rows exist.
- Thumbs/stars auto-submit; note Submit is deliberate.
