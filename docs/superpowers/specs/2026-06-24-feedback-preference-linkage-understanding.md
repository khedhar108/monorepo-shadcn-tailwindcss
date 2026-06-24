# Feedback ↔ Preference Graph Linkage — Understanding

> Note: The reference screenshot could not be viewed (model has no image input).
> This doc captures what was learned from the codebase plus the user's
> reported symptoms. Treat as a working hypothesis until the screenshot is
> re-shared or the symptoms are reproduced locally.

## User-reported symptoms

1. **No submit option for feedback.** The FeedbackBar UI in
   `packages/ai-ui/src/components/chat/FeedbackBar.tsx` *does* render an
   "Apply" button (`:165`) and a "Submit" button inside the expanded note
   (`:183`). Either the bar isn't mounting, the buttons aren't visible in
   the user's build, or the user wants auto-submit (no button at all).
   Needs confirmation.

2. **No model popup.** `ModelPickerTrigger` is mounted in the header
   (`apps/web/app/page.tsx:251`). If no popup appears, providers may be
   empty (`getAvailableProviders` returned `[]`) or the trigger's click
   handler is broken. Separate issue from feedback, but flagged here.

3. **Few default nodes, then 0 graph nodes.** `use-knowledge-graph.ts`
   ships `DEFAULT_DEMO_NODES` (3 nodes) shown only when there is no real
   data AND no demo mode (`:415`). Once real data arrives empty
   (`result.nodes.length === 0`), `hasRealData` flips true (`:384-386`)
   and the demo is replaced by… nothing. So the panel goes from 3 demo
   nodes to 0 real nodes. This matches the symptom exactly.

## What the code does today

### Exploration pipeline (working)

- `apps/web/app/api/chat/route.ts:148` → `extractTopicsDeterministically`
- `apps/web/lib/deterministic-topics.ts` → keyword extraction →
  `topic-extractor` tool with `graphKind: 'exploration'`
- `apps/agent/src/mastra/tools/topic-extractor.ts` →
  `upsertNodes` + `upsertEdges` (co_occurrence)
- Result: `topic` / `entity` / `concept` nodes land in `graph_nodes` with
  `graph_kind='exploration'` and edges in `graph_edges`.

### Preference pipeline (partially working, but disconnected)

- `FeedbackBar.tsx` collects thumbs / 1–5 stars / optional note.
- `AgentChat.submitFeedback` (`agent-chat.tsx:485`) → `POST /api/feedback`.
- `apps/web/app/api/feedback/route.ts` → `feedback-recorder` tool.
- `apps/agent/src/mastra/tools/feedback-recorder.ts`:
  1. `recordFeedback` — writes a raw `feedback` row. ✅
  2. `derivePreferenceLabel` (`derive-preference.ts`) — maps comment
     text / thumbs / rating to a label. Generic fallbacks:
     thumbs-only → `"general sentiment: positive/negative"`;
     rating-only → `"reinforce current style"` / `"needs different approach"`.
  3. `upsertPreferenceNode` (`graph-service.ts:373`) — creates a
     `preference` node (graphKind=preference) with a single edge **only
     to the USER hub**. No edge to the exploration topics of the rated
     message.
  4. `updateNodeScores` — nudges the last 8 nodes by `last_seen`
     (`getRecentNodeIds`). `FeedbackBar` never passes the actual
     `nodeIds` of the rated message, so the rescore is imprecise.

### What is injected before each reply

- `chat/route.ts:49-64` always calls `get-preferences` and prepends
  `renderPreferenceBlock` to the system context. ✅ Preferences ARE
  injected by default.
- Exploration context (`renderBehaviorBlock`) is **only** injected when
  the LLM intent judge flags `useBehaviorContext` (`chat/route.ts:67`).
  Not a guaranteed default before every prompt.

### Graph panel UI

- `KnowledgeGraph.tsx:1109-1146` — Exploration / Preferences / Both tabs
  filter via `graphKind` query param. Filtering logic works.
- `page.tsx:140-146` — graph refreshes on `onFeedbackSubmitted` and
  `onMessagesPersisted`.

## The three real gaps

1. **No edge between preference nodes and the exploration topics** of the
   rated message. `upsertPreferenceNode` only connects to the USER hub
   (`graph-service.ts:399-410`). Preferences float isolated off the hub.

2. **Generic preference labels** when feedback is thumbs-only or
   rating-only (`derive-preference.ts:78-97`). Not real preferences.

3. **FeedbackBar never sends the rated message's nodeIds**, so
   `updateNodeScores` nudges the wrong nodes (last 8 by last_seen, not
   the topics from the rated message).

## Plus the user's two UI symptoms

4. **FeedbackBar submit button not visible / not present** in the user's
   build. Either a rendering bug or the user wants auto-submit.

5. **Graph shows 0 nodes after chat starts.** `hasRealData` flips true on
   the first empty API response, suppressing the demo, and the real
   graph query returns nothing because either (a) the agent's
   `topic-extractor` call hasn't completed, or (b) the user/message ids
   don't line up between the chat stream and the topic extractor.

## Open questions for the user

- Q1: Submit button — do you want **auto-submit** (no button, debounced
  on each thumbs/star/note change), or keep an explicit button but fix
  why you can't see it?
- Q2: Should preference nodes get **edges to the exploration topics** of
  the rated message? (I believe yes — this is the missing link.)
- Q3: For the "0 graph nodes" symptom — is the agent actually calling
  `topic-extractor` after each reply, or is the deterministic extractor
  the only path that's firing? (Check: do you see a "Topic extraction"
  tool call accordion in the chat UI after each answer?)

## What "working fine" looks like (verification checklist)

- After a substantive chat turn: 2–5 new exploration nodes appear in the
  graph, connected by co_occurrence edges.
- After rating an answer (thumbs + stars + note): a preference node
  appears, wired by a `preference` edge to the exploration topics of
  that specific message (not just the USER hub).
- The preference label is meaningful (derived from the note text, not a
  generic "general sentiment" fallback) whenever a note is present.
- Each new prompt's system context includes BOTH the preference block
  AND a compact exploration summary, by default.
- Graph panel never shows 0 nodes unless the DB is genuinely empty for
  that user; the demo fallback stays until real nodes exist.
