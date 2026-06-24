# Goal 1: Tool Persistence Core

**Priority:** High — fixes the actual bug (tools not rendering on history reload)
**Depends on:** Nothing (types already exist in `packages/ai-ui/src/lib/types.ts`)
**Files:** 4

---

## Problem

During live streaming, the ChainOfThought accordion shows reasoning + tool calls (name, input, output, status). On history reload, only plain assistant text appears. Root cause: `chat/route.ts`'s `onFinish` persists only `assistantText` (string). Tool/reasoning chunks from the Mastra stream are discarded.

## Solution

Add a `PartAccumulator` inside `createMastraChunkStream` (the one place that iterates every Mastra chunk). It accumulates `SerializablePart[]` alongside the existing `assistantText`. On finish, parts are persisted in the assistant `StoredMessage`. The client reads `msg.parts` with a graceful fallback for old entries.

---

## File 1: `apps/web/lib/mastra-client.ts`

### What to add

A `PartAccumulator` class (~60 lines) inside the file (before `createMastraChunkStream`). It switches on Mastra chunk types and builds `SerializablePart[]`.

### Chunk type mapping

| Mastra chunk type | Action |
|---|---|
| `text-delta` | Flush reasoning buffer (push `{type:"reasoning"}` if non-empty); append to running text buffer. |
| `reasoning-delta` | Append to reasoning buffer. |
| `tool-call` | Flush reasoning; store `{ toolCallId, toolName, args }` in pending map. |
| `tool-result` | Flush text; finalize the pending tool → `{ type:"dynamic-tool", state: isError ? "output-error" : "output-available", input, output }`. |
| `tool-error` | Flush text; finalize the pending tool → `{ type:"dynamic-tool", state:"output-error", errorText }`. |
| All others | No-op (ignored). |

### Flush logic

- `flushReasoning()`: if reasoning buffer non-empty, push `{ type:"reasoning", text }`, clear buffer.
- `flushText()`: if text buffer non-empty, push `{ type:"text", text }`, clear buffer.
- This preserves interleaving: text→tool→text yields two text parts. `groupParts` in the renderer already handles this.

### `finish()` method

1. Flush reasoning, flush text.
2. Any pending `tool-call` without a matching result → push `{ type:"dynamic-tool", state:"output-error", errorText:"Tool did not complete" }`.
3. Return `{ text: string, parts: SerializablePart[] }`.
4. Defensive: `safeStringify` any non-serializable values in tool input/output before returning.

### Wiring changes in `createMastraChunkStream`

**Before (current):**
```ts
let assistantText = "";
// in onChunk:
if (typeof c.text === "string") assistantText += c.text;
if (c.type === "text-delta" && typeof c.payload?.text === "string")
  assistantText += c.payload.text;
// after stream:
await onFinish?.(assistantText);
```

**After:**
```ts
const acc = new PartAccumulator();
// in onChunk:
acc.onChunk(chunk);
// after stream:
const { text, parts } = acc.finish();
await onFinish?.({ assistantText: text, parts });
```

### Signature change

`StreamAgentOptions.onFinish` widens from:
```ts
onFinish?: (result: { assistantText: string }) => Promise<void> | void;
```
To:
```ts
onFinish?: (result: { assistantText: string; parts: SerializablePart[] }) => Promise<void> | void;
```

Import `SerializablePart` from `@repo/ai-ui/lib/types`.

### The `streamAgentToAiSdk` adapter

Line 182 currently does:
```ts
onFinish ? (text) => onFinish({ assistantText: text }) : undefined
```
Change to:
```ts
onFinish ? ({ assistantText, parts }) => onFinish({ assistantText, parts }) : undefined
```

---

## File 2: `apps/web/app/api/chat/route.ts`

### What to change

In the `onFinish` callback (~line 79), the assistant `StoredMessage` gains `parts`:

```ts
import type { SerializablePart } from "@repo/ai-ui/lib/types";

// inside onFinish:
const msgs: StoredMessage[] = [
  {
    id: userMessageId,
    role: "user",
    content: typeof lastUser?.content === "string" ? lastUser.content : "",
    createdAt: new Date().toISOString(),
  },
  {
    id: assistantMessageId,
    role: "assistant",
    content: assistantText,
    parts: parts.length > 0 ? parts : undefined,   // NEW
    createdAt: new Date().toISOString(),
  },
];
```

The `onFinish` destructuring changes from:
```ts
onFinish: async ({ assistantText }) => {
```
To:
```ts
onFinish: async ({ assistantText, parts }) => {
```

Everything else in `onFinish` (history entry, appendMessages, verification, topics) stays unchanged. `parts` rides alongside in the JSON.

---

## File 3: `packages/ai-ui/src/components/llm/agent-chat.tsx`

### What to change

**`StoredMessageData` type (~line 97):**
```ts
type StoredMessageData = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  parts?: SerializablePart[];  // NEW
};
```
Import `SerializablePart` from `@repo/ai-ui/lib/types`.

**`storedMessageToUIMessage` (~line 104):**
```ts
function storedMessageToUIMessage(msg: StoredMessageData): UIMessage {
  const parts: UIMessage["parts"] =
    msg.parts && msg.parts.length > 0
      ? msg.parts                           // stored parts — same shape renderer expects
      : [{ type: "text", text: msg.content }]; // fallback: old entries + user msgs
  return {
    id: msg.id,
    role: msg.role,
    parts,
    createdAt: msg.createdAt ? new Date(msg.createdAt) : undefined,
    content: msg.content,
  } as UIMessage;
}
```

No changes to `MessageParts`, `groupParts`, `StepGroup`, or `AgentToolPart` — they already consume this shape.

---

## File 4: `apps/web/lib/chat-history-store.ts`

### What to change

Replace the local `StoredMessage` type definition with an import from the canonical source:

**Remove** (lines 25-30):
```ts
export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
```

**Add** (at top, after existing imports):
```ts
import type { StoredMessage } from "@repo/ai-ui/lib/types";
export type { StoredMessage };
```

The `re-export` keeps all existing `import { StoredMessage } from "./chat-history-store"` consumers working without changes. `HistoryEntry`, `HistoryStore`, and all functions stay unchanged.

---

## Verification

1. After a chat turn that calls tools (topic extraction, graph query, etc.), reload the page.
2. Select the thread from history sidebar.
3. **Expected:** the ChainOfThought accordion renders with the same tool steps, inputs, outputs, and "Done"/"Error" states.
4. **Old threads** (pre-parts entries in `chat-history.json`): still render as plain text, no errors.
5. **User messages:** render as plain text (no spurious tool parts).
6. `deterministic-topics.ts`, `intent-judge.ts`, `firstMessage`/`lastQuery`/`lastResult` still work (they read `content`, which is unchanged).
