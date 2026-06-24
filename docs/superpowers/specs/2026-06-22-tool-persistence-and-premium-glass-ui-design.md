# Tool Persistence & Premium Glass UI

**Date:** 2026-06-22
**Status:** Approved (pending spec review)
**Scope:** Persist reasoning + tool-call parts so they render on history reload (Manus/Kimi style); premium glassmorphism visual pass on chat, graph, and history.

---

## Problem Summary

1. **Tools don't render on history reload.** During live streaming, the assistant message shows a grouped "Thought for N steps" ChainOfThought accordion (reasoning + tool calls with input/output/status). But when a thread is reloaded from history, only plain assistant text appears — the accordion has nothing to render.
2. **Root cause.** `apps/web/app/api/chat/route.ts`'s `onFinish` persists only `assistantText` (a plain string). Tool-call, tool-result, tool-error, and reasoning chunks are never captured. `storedMessageToUIMessage` (`agent-chat.tsx:104`) therefore rebuilds each message with a single `{ type: "text" }` part. The rendering code is correct; the data never round-trips.
3. **History sidebar polish.** Title-only rendering is done, but titles are raw first messages and the list lacks date grouping vs. ChatGPT/Claude/Manus.
4. **Premium visual pass.** The shell needs a unified glassmorphism treatment (chosen aesthetic).

---

## Target

A Manus/Kimi-style chat where every assistant message shows a grouped "Thought for N steps" ChainOfThought accordion containing reasoning + tool calls (name, input, output, status), rendering **identically when live-streaming AND when reloading a stored thread**. The history sidebar shows clean titles + relative timestamps under Today/Yesterday/Older date groups. The whole shell gets a glassmorphism premium visual pass.

---

## Architecture

Single source of truth at the server. The Mastra data stream is already iterated once in `createMastraChunkStream` (`apps/web/lib/mastra-client.ts:120`); that is the only place that needs to capture parts.

```
Mastra stream ──► createMastraChunkStream (server)
                   ├─ parse chunks → accumulate SerializablePart[]
                   │   • text-delta      → text part
                   │   • reasoning-delta → reasoning part
                   │   • tool-call       → tool part (pending, held in a map)
                   │   • tool-result     → tool part finalized → output-available
                   │   • tool-error      → tool part finalized → output-error
                   └─ onFinish → persist StoredMessage{ role, content, parts[] }
                                                       │
history GET ◄──── chat-history.json ◄─────────────────┘
                                                       │
agent-chat.tsx loadHistory → storedMessageToUIMessage reads parts[]
                          → reconstructs UIMessage.parts[] (same shape renderer expects)
                          → existing MessageParts → groupParts → StepGroup → AgentToolPart
                          → identical render to live streaming
```

Key insight: `MessageParts` / `groupParts` / `StepGroup` / `AgentToolPart` already render parts correctly (proven in live streaming). The fix is purely making `parts[]` round-trip through storage. The rendering code is unchanged.

### Why server-side capture (chosen over client-side POST)

- `createMastraChunkStream` already iterates every chunk and already accumulates `assistantText`. Extending it to accumulate `parts[]` is incremental (~60 lines, one file).
- Single source of truth: the server's `onFinish` already persists. Adding parts to the same write means no second network call, no client/server drift, no data lost if the tab closes mid-turn.
- Mastra chunk types map 1:1 to the AI SDK part types the renderer already handles.

---

## Data Model

### `StoredMessage` (extends current shape — backward compatible)

```ts
type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;          // KEPT. Plain text, derived from text parts.
                             // deterministic-topics, intent-judge, firstMessage,
                             // lastQuery/lastResult all still read this. No churn.
  createdAt: string;
  parts?: SerializablePart[]; // NEW. Only assistant turns populate this.
                              // User messages: omitted/empty (plain text).
};
```

### `SerializablePart` — minimal storage-safe subset of AI SDK UI parts

```ts
type SerializablePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "dynamic-tool";   // matches ToolPart the renderer switches on (agent-chat.tsx:122)
      toolName: string;        // prettifyToolName maps it → "Topic extraction" etc.
      state: "output-available" | "output-error";
      input: unknown;          // tool-call payload.args
      output: unknown;         // tool-result payload.result
      errorText?: string;      // tool-error payload.error
    };
```

### Design choices

- **Only terminal tool states are persisted** (`output-available` / `output-error`). Live-only transient states (`input-streaming`, `input-available`) have no meaning in history. The accordion shows "Done" / "Error" on reload — exactly what Manus/Kimi show.
- **`reasoning` keeps only accumulated text.** The live "Reasoning…" shimmer is gone on reload, which is correct — a finished thought isn't shimmering.
- **Ignored chunk types:** `text-start`, `text-end`, `reasoning-start`, `reasoning-end`, `reasoning-signature`, `redacted-reasoning`, `step-start`, `step-finish`, `finish`, `start`, `raw`, `source`, `file`, `response-metadata`, all `background-task-*`, all `network-*`, all `workflow-*`. They carry no rendering value for history.
- **`content` derivation:** server accumulator joins all `text` parts (already what `assistantText` is). User message `content` is the user's text; `parts` omitted.
- **Migration:** none. Old entries lack `parts`. Reconstruction falls back to a single text part when `parts` is missing. Existing threads keep rendering as today; new turns get parts.

### Canonical type location

`SerializablePart` and the extended `StoredMessage` are defined in **`packages/ai-ui/src/lib/types.ts`** (canonical) and imported by `apps/web/lib/chat-history-store.ts`. This is the correct dependency direction (`apps/web` already depends on `@repo/ai-ui`); it avoids duplicating the type and avoids a wrong-direction `ai-ui → apps/web` import.

---

## Server-Side Capture

### `PartAccumulator` — new class in `apps/web/lib/mastra-client.ts`

~60 lines. Consumed inside `createMastraChunkStream`. Replaces the current `assistantText` string accumulation.

**State:**
- `parts: SerializablePart[]` — finalized, in order.
- `text: string` — running text buffer (current `assistantText` behavior).
- `reasoning: string` — running reasoning buffer.
- `tools: Map<toolCallId, { name; input? }>` — pending tool calls awaiting a result.

**`onChunk(chunk)` switch:**

| Chunk type | Action |
|------------|--------|
| `text-delta` | flush reasoning buffer (push `{type:"reasoning"}` if non-empty); append `payload.text` to `text`. |
| `reasoning-delta` | append `payload.text` to `reasoning`. |
| `tool-call` | flush reasoning; record `tools.set(payload.toolCallId, { name: payload.toolName, input: payload.args })`. |
| `tool-result` | flush text (push `{type:"text"}` from buffer); pop the pending tool by `toolCallId`; push `{ type:"dynamic-tool", state: payload.isError ? "output-error" : "output-available", input, output: payload.result, errorText: payload.isError ? String(payload.result) : undefined }`. |
| `tool-error` | flush text; pop pending tool; push `{ type:"dynamic-tool", state:"output-error", input, output: undefined, errorText: errorMessage }`. |
| all others | ignored. |

`flushText()` pushes a `{type:"text"}` part only when the buffer is non-empty, then clears it. `flushReasoning()` does the same for reasoning. This preserves interleaving: text → tool → text yields two text parts, which `MessageParts`'s `groupParts` already handles.

**`finish(): { text, parts }`:**
- flush reasoning, then flush text.
- Any `tool-call` still pending (no matching `tool-result` / `tool-error`) → push a `{type:"dynamic-tool", state:"output-error", errorText:"Tool did not complete"}`. History wants terminal states only.

### Wiring

**`createMastraChunkStream`** (`mastra-client.ts:120`):
- Replace `let assistantText = ""` + the two accumulators with `const acc = new PartAccumulator()` and `acc.onChunk(chunk)` in the existing `onChunk`.
- Replace the `onFinish?.(assistantText)` call with `const { text, parts } = acc.finish(); onFinish?.({ assistantText: text, parts });`.

**`StreamAgentOptions.onFinish`** signature widens from `(result: { assistantText: string })` to `(result: { assistantText: string; parts: SerializablePart[] })`.

**`chat/route.ts` `onFinish`** (~line 79): the assistant `StoredMessage` carries `parts`:
```ts
{
  id: assistantMessageId,
  role: "assistant",
  content: assistantText,
  parts: parts.length > 0 ? parts : undefined,   // NEW
  createdAt: new Date().toISOString(),
}
```
User message unchanged (parts-less). The verify block at `chat/route.ts:128-138` stays as-is.

**`api/chat/history/route.ts` GET:** unchanged — `StoredMessage` flows through opaquely; `parts` rides along in the JSON.

---

## Client-Side Reconstruction

### `storedMessageToUIMessage` (`agent-chat.tsx:104`)

```ts
function storedMessageToUIMessage(msg: StoredMessageData): UIMessage {
  const parts: UIMessage["parts"] =
    msg.parts && msg.parts.length > 0
      ? msg.parts
      : [{ type: "text", text: msg.content }];
  return {
    id: msg.id,
    role: msg.role,
    parts,
    createdAt: msg.createdAt ? new Date(msg.createdAt) : undefined,
    content: msg.content,
  } as UIMessage;
}
```

Once `parts[]` is populated, the existing `MessageParts` → `groupParts` → `StepGroup` → `AgentToolPart` pipeline renders reasoning + tools in the ChainOfThought accordion exactly as during live streaming. The only behavioral difference on reload: tool steps show terminal states ("Done"/"Error") and reasoning shows final text — correct Manus/Kimi reload behavior.

### `StoredMessageData` (`agent-chat.tsx:97`)

Add `parts?: SerializablePart[]` (imported from `@repo/ai-ui/lib/types`).

### `StepGroup` header label

Already correct: `isStreamingThisMessage` is always `false` on history reload, so the header reads `"Thought for N steps"`. No change needed.

---

## History Sidebar Polish

The spec's Fix 1 (title-only) is already implemented (`ChatHistory.tsx:274-297` renders title + meta row only). Two gaps remain vs. ChatGPT/Claude/Manus.

### Title quality — deterministic client formatter

Current: `thread.lastQuery || thread.topics[0] || "New conversation"` (raw message). New: a `formatThreadTitle(raw)` helper in `ChatHistory.tsx`:
- Take the first line / first sentence (split on `\n` or `. ` / `? ` / `! `).
- Strip leading greetings: `^(hi|hey|hello|yo|help|please)[,\s]+` (case-insensitive).
- Cap at 48 chars, append `…` if truncated.
- Fallback chain unchanged: title → topics[0] → "New conversation".

No LLM call (ponytail: avoid the round-trip). The full message remains as the `title` attribute tooltip on hover.

### Date grouping — section headers

Add `formatDateGroup(dateStr): string` in `ChatHistory.tsx`:
- Same day → "Today"
- Yesterday → "Yesterday"
- Within 7 days → "Previous 7 Days"
- Otherwise → the locale date (e.g. "Jun 2026" or full date).

Render threads bucketed under these headers. Each section header: uppercase tracking-wide muted micro-label (`text-[10px] font-semibold uppercase tracking-wider`) with a hairline divider (`aria-border-subtle`). Items keep their existing relative-time meta row underneath.

Buckets are computed once from the sorted `threads` array (already sorted by `lastActive` desc from the store). Empty buckets are not rendered.

---

## Premium Glassmorphism UI

The codebase already has `.aria-glass` / `.aria-glass-strong` (globals.css:156-168), backdrop-blur header, dot-grid ambient background, and `--aria-*` tokens. The pass builds on these. **Tailwind v4** (no config file — `@theme` in CSS).

### Surface system — 3-tier glass hierarchy

| Tier | Class | Use |
|------|-------|-----|
| Base | `aria-glass` (rgba 0.82, blur 24px) | History sidebar, graph panel |
| Raised | `aria-glass-strong` (rgba 0.92, blur 40px) | Chat card (focal point), expanded overlay |
| Floating | `.aria-glass-float` (new) | Tool cards, NodeDetail, GraphControls settings panel, dropdowns, tooltips |

New token + utility in `globals.css`:
```css
--aria-glass-border: rgba(255,255,255,0.6);
.aria-glass-float {
  background: rgba(255,255,255,0.88);
  backdrop-filter: blur(32px) saturate(1.5);
  border: 1px solid var(--aria-glass-border);
  box-shadow: var(--aria-shadow-lg), inset 0 1px 0 rgba(255,255,255,1);
}
```
Applied to: `Tool` card (`tool.tsx`), `NodeDetail`, GraphControls settings panel, model-picker dropdown.

### Chat card (agent-chat.tsx) — focal surface

- Card: `aria-glass-strong` instead of opaque `bg-white`. Inner `Conversation`: translucent inset (`bg-neutral-50/40`) reading as a recessed well inside the glass.
- **Message bubbles:** assistant drops the hard emerald avatar box for a glass "disc" with the Sparkles glyph + subtle accent glow on the message column. User message: tinted-glass bubble (teal `aria-accent-muted` at ~0.5 opacity) instead of the rose avatar block, for a calmer premium feel.
- **ChainOfThought accordion** (the Manus/Kimi hero element): header gets a glass pill treatment with a subtle gradient stroke; expand/collapse chevron rotates with spring easing. Tool step rows inside get the `aria-glass-float` card so each tool call reads as a discrete glass object.
- Typing/streaming indicator: replace plain "Thinking..." text with an animated 3-dot glass shimmer pill (reuse `aria-shimmer`).

### Knowledge graph

- Background: keep white canvas; strengthen the existing radial teal wash slightly so glass overlays pop.
- Segmented tab (Exploration/Preferences/Both) → `aria-glass-strong` pill with sliding active indicator (accent fill + glow).
- `GraphControls` toolbar → `aria-glass-float` row; settings panel → `aria-glass-float` with soft drop shadow.
- `NodeDetail` → `aria-glass-float` (currently static `rgba(255,255,255,0.96)`; unify with tokens).
- Bottom-left summary → `aria-glass-float`.

### History sidebar (ChatHistory.tsx)

- Container → `aria-glass`. Active thread item: glass "selected" treatment — subtle accent left-border (3px gradient teal→emerald) + `aria-glass-float` background + slight hover scale.
- Section headers (Today/Yesterday/…) → uppercase tracking-wide muted micro-labels with hairline divider.
- New-chat button → glass pill with accent glow on hover.

### Header (page.tsx)

Already glass (`rgba(255,255,255,0.7)` + blur). Enhance: subtle bottom hairline gradient (accent → transparent); ARIA logo glyph `aria-glow-accent` intensified slightly.

### Motion

Reuse existing keyframes. Add one new keyframe for the message-in entrance:
```css
@keyframes aria-msg-in { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }
.aria-msg-in { animation: aria-msg-in 0.35s cubic-bezier(0.16,1,0.3,1) both; }
```
Applied to each message row so new messages glide in (during both streaming and history load).

### Out of scope (discipline)

- No dark theme (light-token system; dark theme is a separate project).
- No font changes (Geist Sans already premium).
- No graph rendering algorithm changes (cluster/collision forces stay).
- No new dependencies.

---

## Files Touched

| File | Change |
|------|--------|
| `packages/ai-ui/src/lib/types.ts` | Extend existing file: add canonical `SerializablePart` + `StoredMessage` types. |
| `apps/web/lib/chat-history-store.ts` | Replace the local `StoredMessage` definition with an import from `@repo/ai-ui/lib/types` (single canonical type; the store adds `HistoryEntry`/`HistoryStore` locally on top). |
| `apps/web/lib/mastra-client.ts` | Add `PartAccumulator` class; widen `onFinish` to `{ assistantText, parts }`; replace `assistantText` accumulation in `createMastraChunkStream`. |
| `apps/web/app/api/chat/route.ts` | Pass `parts` into the assistant `StoredMessage` in `onFinish`. |
| `packages/ai-ui/src/components/llm/agent-chat.tsx` | `StoredMessageData` gains `parts?`; `storedMessageToUIMessage` reads `msg.parts` with fallback; glass styling pass on card, bubbles, avatars, CoT accordion, typing indicator; `aria-msg-in` on message rows. |
| `packages/ai-ui/src/components/history/ChatHistory.tsx` | `formatThreadTitle` + `formatDateGroup`; bucketed rendering with section headers; glass container + selected/hover treatments. |
| `packages/ai-ui/src/components/graph/GraphControls.tsx` | `aria-glass-float` on toolbar + settings panel. |
| `packages/ai-ui/src/components/graph/NodeDetail.tsx` | Unify to `aria-glass-float`. |
| `packages/ai-ui/src/components/graph/KnowledgeGraph.tsx` | `aria-glass-strong` on segmented tab; summary → `aria-glass-float`; slight background wash strengthen. |
| `packages/ai-ui/src/components/ai-elements/tool.tsx` | `Tool` card → `aria-glass-float`. |
| `apps/web/app/globals.css` | Add `--aria-glass-border` token, `.aria-glass-float` utility, `aria-msg-in` keyframe + class. |
| `apps/web/app/page.tsx` | Header hairline gradient + logo glow; panel surfaces swap to glass utilities. |

**Total:** ~12 files. Persistence core is 1 new class + ~10 lines of wiring across 3 files. The rest is the visual pass.

---

## Verification

- **Persistence round-trip:** after a chat turn that calls tools, reload the page / select the thread from history → the ChainOfThought accordion renders with the same tool steps, inputs, outputs, and "Done"/"Error" states seen during streaming.
- **Old entries:** existing threads in `chat-history.json` (pre-parts) still render as plain assistant text with no errors.
- **User messages:** render as plain text in both live and history modes (no spurious tool parts).
- **Text consumers unbroken:** `deterministic-topics.ts`, `intent-judge.ts`, `firstMessage`/`lastQuery`/`lastResult` still read `content` and behave as before.
- **Visual:** chat, graph, and history panels show the 3-tier glass hierarchy; tool cards and NodeDetail render as floating glass objects; messages glide in on `aria-msg-in`.

---

## Risks & Mitigations

- **Chunk taxonomy drift.** Mastra could add/rename chunk types. Mitigation: the accumulator's switch ignores unknown types (no throw), so unknown chunks are silently dropped rather than breaking the stream. The `default` case is a no-op.
- **Large tool outputs.** A verbose `graph-query` result could bloat `chat-history.json`. Mitigation: the existing `MAX_MESSAGES_PER_THREAD = 50` cap still applies; per-message size is bounded by the turn. Acceptable for the dev/single-user store. (Upgrade path noted in a `ponytail:` comment: truncate oversized tool outputs if the file grows past a threshold.)
- **JSON serialization of `unknown` outputs.** Tool outputs are `unknown`. All Mastra tool outputs observed are JSON-serializable (records/strings). Mitigation: `JSON.stringify` on the way in is implicit (the store writes `JSON.stringify(store)`); non-serializable values would throw on write and be caught by the existing try/catch in `writeHistoryUnsafe`'s callers. Add a defensive `safeStringify` that replaces non-serializable values with `"[unserializable]"` in `PartAccumulator.finish()` before returning.
