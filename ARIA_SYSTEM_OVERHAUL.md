# ARIA — System Overhaul Plan

> **Purpose:** A single, self-contained plan a fresh conversation can execute **file-by-file** to make history, knowledge graph, memory, and feedback work together reliably — **without breaking existing working code**.
>
> **Owner:** Senior developer review · **Aligned with:** `MVP_PROGRESS.md`
> **Stack:** Next.js 16 App Router · Mastra · LibSQL · AI SDK v6 · Tailwind v4

---

## 0. How to use this document

> ⚠️ **Read this whole section before writing any code.** It defines the only correct execution order. (The per-section letters A–G are *concern groups*, NOT execution order — see §5 for that.)

### 0.1 Principles

1. **Read `MVP_PROGRESS.md` first** for the architecture that already works — do not redo it.
2. **Sections A–G are concern groups**, not steps. Execute them in the **phase order** in §0.3 / §5, which respects compile dependencies.
3. Every change block has the form:
   - **File** (absolute path) · **Status:** `KEEP` / `MODIFY` / `CREATE` / `DELETE`
   - **Lines** (current line refs) + **Change** (before → after) + **Why**
4. **Per-step gate (mandatory):** after *every numbered step* in §5, run:
   ```bash
   pnpm check-types && pnpm lint
   ```
   Do not proceed to the next step until both are green. This is how you keep working code working at all times.
5. **Golden rule:** if a function is not listed here, leave it alone.

### 0.2 Dependency DAG (why the order matters)

```
B1 schema ──┐
            ├─► B2 graph-service (graph_kind, getUserHub, getUserPreferences, upsertPreferenceNode)
            │        │
            │        ├─► G1 index.ts bootstrap (uses ensureUserHubs)
            │        ├─► B3/B4 tools (use graphKind)
            │        ├─► D preference-injection (uses getUserPreferences)
            │        └─► F1 feedback-recorder (uses upsertPreferenceNode)
            │
A2 mastra-client (systemContext + onFinish hook) ─► A1 route.ts (single writer)
        ▲                                               │
        │                                               ├─► C1 judge + C2 fallback → route.ts uses judge
        │                                               ├─► D1/D2 preferences → route.ts injects prefs
        │                                               └─► E1/E2 behavior → route.ts injects behavior (gated)
        │
A4 agent-chat (send stable id; drop client persist) ─► (independent of route.ts internals)

F (feedback) needs B2 + D1 first (writes preference nodes that D injects).
B7 UI (segmented graph) needs B5/B6 (API + hook expose graphKind) first.
```

**Hard compile rule:** a block that *calls* a function must be edited **after** the block that *creates* that function — otherwise `check-types` fails. The phase order below enforces this.

### 0.3 Phase order (the ONLY order to follow)

| Phase | Steps (§5) | Outcome | Gate |
|---|---|---|---|
| **P1 — Foundation** | 1, 2, 3 | DB has `graph_kind`, service has new fns, USER hub exists | `check-types` green, boot creates hub row |
| **P2 — Fix history** | 4, 5, 6 | Server is the single writer; bug fixed | Test #1–2 pass; reload restores both turns |
| **P3 — Intelligence** | 7, 8, 9, 10 | LLM judge + deterministic topic floor | Test #3 pass; graph grows on substantive turn |
| **P4 — Adaptation** | 11, 12 | Preferences always injected; behavior gated | Test #4–5 pass |
| **P5 — Feedback loop** | 13, 14, 15, 16, 17 | Feedback writes preferences → next answer changes | Test #6–7 pass |
| **P6 — Premium UI** | 18, 19, 20, 21 | Two-graph segmented view | Test #8–10 pass |

**Each phase is independently shippable.** If you must stop early, stop at a phase boundary — the app stays green.

---

## 1. Diagnosis (why we're doing this)

| Symptom | Root cause | Evidence |
|---|---|---|
| Assistant replies vanish on thread restore; only the user msg survives | Assistant message saved only by a fragile client `busy→idle` effect; it doesn't fire on StrictMode double-invoke / early unmount / error status | `data/chat-history.json` has `lastResult: ""` and the lone user msg has a server id `msg-<timestamp>-<random>` |
| Duplicate user messages after a few turns | Server saves user msg with a throwaway id; client saves the same msg again with the `useChat` client id; dedup set seeded from server ids can't match | `route.ts:76` vs `agent-chat.tsx:291` |
| Feedback only recolors nodes; doesn't change the next answer | Feedback updates `avg_score` on topic nodes, but nothing ever reads `nodeType='preference'` back into the agent context | `feedback-recorder.ts:60` updates nodes; no preference-injection path exists |
| Graph stays empty / falls back to demo | `topicExtractorTool` is only *permitted* by `routeTools`, the LLM may skip it; no deterministic guarantee | `tool-router.ts` (regex) + `aria-agent.ts:67` ("call it once") |
| Tool routing is brittle regex | `classifyIntent` can't generalize, can't pick tool order, can't gate the behavior-scoring path | `tool-router.ts:62` |

---

## 2. Target architecture (after this overhaul)

```mermaid
flowchart TB
    U[User types] --> UI[AgentChat]
    UI -->|POST /api/chat<br/>client generates message ids| API

    subgraph API["/api/chat route"]
        N[normalize + guardrails]
        J["LLM JUDGE<br/>classifyIntent()
        • intent: smalltalk/substantive/...
        • toolOrder: [list,of,tools]
        • useBehaviorContext: bool"]
        PREF["INJECT PREFERENCES (always-on)<br/>getUserPreferences(userId) → system msg"]
        STREAM[streamText / Mastra stream<br/>onFinish → persist BOTH turns]
    end

    UI --> N --> J --> PREF --> STREAM

    subgraph STORES
        JSON[(chat-history.json<br/>single writer: server)]
        EXP[("exploration graph<br/>topic nodes, graph_kind='exploration'")]
        PREFG[("preferences graph<br/>pref nodes, graph_kind='preference'<br/>+ USER hub node")]
        MEM[(Mastra Memory<br/>lastMessages + recall)]
    end

    STREAM -->|deterministic on substantive| EXP
    STREAM -->|onFinish: user+assistant| JSON
    PREF --> PREFG
    PREF --> MEM
    STREAM --> MEM

    FB[FeedbackBar] -->|POST /api/feedback| FR[feedback-recorder]
    FR --> PREFG
    PREFG -.always injected.-> PREF

    GRAPH_UI[KnowledgeGraph<br/>segmented: Preferences | Exploration]
    EXP --> GRAPH_UI
    PREFG --> GRAPH_UI
```

**Three principles:**

1. **Server is the single writer** of `chat-history.json` — no client persist effect, no fire-and-forget user-only save.
2. **Two graphs, one table** — a `graph_kind` column distinguishes `preference` (always injected) from `exploration` (topic extraction). A `USER` hub node anchors preferences.
3. **One LLM judge** decides intent, tool order, and whether behavior-context loads — replacing regex routing.

---

## Section A — History: make the server the single reliable writer

### A1. `MODIFY` — `apps/web/app/api/chat/route.ts`

**Why:** Remove the fire-and-forget user-only save + the duplicate-id write. Capture both turns reliably via `onFinish`, once.

Replace the body of `POST(req)` (currently `route.ts:21-100`) so that:

- **Message ids come from the client** (passed through in the request body), not generated server-side.
- The response stream is consumed **once** and, on completion, the **assistant text + user text** are persisted together.
- The fire-and-forget `appendHistoryEntry` + `appendMessages(userMessages)` block (`route.ts:53-85`) is **deleted**.

> **⚠️ This block is executed in 3 staged steps** (see §5): **A1a** (P2, minimal history fix), **A1b** (P3, wire judge), **A1c** (P4, wire prefs/behavior). Do **not** paste the full version below in one edit — it won't compile until judge (C1) and preference helpers (D1) exist. Build it up incrementally as the steps instruct.

**Final shape (target after P4):**

```ts
export async function POST(req: Request) {
  const body = await req.json();
  const chatRequest = normalizeChatRequest(body, ARIA_AGENT_ID);
  const guardrail = await runInputGuardrails(chatRequest);
  if (!guardrail.allowed) {
    return Response.json({ error: guardrail.reason }, { status: guardrail.status });
  }

  // 1) LLM judge (Section C) — returns intent, toolOrder, useBehaviorContext
  const judgment = await classifyIntentLLM(chatRequest.messages);

  // 2) Always inject preferences (Section D)
  const userId = chatRequest.requestContext?.userId;
  const preferences = userId ? await getUserPreferences(userId) : [];

  // 3) Build the stream (Mastra). The onFinish callback persists BOTH turns.
  const { stream, response } = await streamAgentToAiSdk({
    agentId: chatRequest.agentId,
    messages: chatRequest.messages,
    memory: chatRequest.memory,
    requestContext: chatRequest.requestContext,
    systemContext: renderPreferenceBlock(preferences)
      + (judgment.useBehaviorContext ? renderBehaviorBlock(judgment) : ""),
    activeTools: judgment.toolOrder,
    toolChoice: judgment.intent === "smalltalk" ? "none" : "auto",
    onFinish: async ({ assistantText }) => {
      const threadId = chatRequest.memory?.thread;
      if (!threadId || !userId) return;
      const lastUser = [...chatRequest.messages].reverse().find(m => m.role === "user");
      const msgs: StoredMessage[] = [
        // stable ids: user id from client (body.lastUserMessageId), assistant id deterministic
        { id: body.lastUserMessageId, role: "user", content: lastUser.content, createdAt: new Date().toISOString() },
        { id: `${threadId}:${Date.now()}`, role: "assistant", content: assistantText, createdAt: new Date().toISOString() },
      ];
      await appendHistoryEntry({ /* ...metadata */ lastQuery: lastUser.content, lastResult: assistantText });
      await appendMessages(threadId, msgs, userId);
      await verifyThreadPersisted(threadId, msgs.map(m => m.id));
      // Deterministic topic floor (C3) — only on substantive turns
      if (judgment.intent === "substantive" || judgment.intent === "history") {
        await extractTopicsDeterministically({ userId, threadId, messageId: msgs[1].id, userMessage: lastUser.content, assistantMessage: assistantText });
      }
    },
  });

  const res = createUIMessageStreamResponse({ stream });
  res.headers.set("Cache-Control", "no-cache, no-transform");
  return res;
}
```

**Staged edits to `route.ts`:**

- **Step 5 (A1a — P2):** delete `route.ts:53-85`; add `onFinish` that persists user + assistant with stable client id; call `verifyThreadPersisted`. **Replace** the `classifyIntentLLM` / `getUserPreferences` / `renderPreferenceBlock` / `extractTopicsDeterministically` calls with `// TODO(step 10/12)` comments and pass `activeTools: undefined`, `toolChoice: "auto"`, `systemContext: ""` for now. This compiles standalone and **fixes the history bug immediately.**
- **Step 10 (A1b — P3):** replace the judge TODO with the real `classifyIntentLLM` call; add `extractTopicsDeterministically` to `onFinish`.
- **Step 12 (A1c — P4):** replace the preference TODO with `getUserPreferences` + `renderPreferenceBlock` (+ conditional `renderBehaviorBlock`).

**Keep at every stage:** guardrails, normalize, response headers.

### A2. `MODIFY` — `apps/web/lib/mastra-client.ts`

**Lines:** `StreamAgentOptions` (currently `mastra-client.ts:51-63`) and `streamAgentToAiSdk` (`mastra-client.ts:130-172`).

**Change:**

1. Add two new optional fields to `StreamAgentOptions`:
   - `systemContext?: string` — prepended/prepended into the agent's system message (preferences + behavior).
   - `onFinish?: (result: { assistantText: string }) => Promise<void> | void`
2. In `streamAgentToAiSdk`, wire the Mastra stream through `onFinish`. The Mastra `agent.stream(...)` returns an object whose `processDataStream` already emits text chunks — accumulate them in the existing `createMastraChunkStream` transform and call `onFinish` on close with the joined assistant text:

```ts
function createMastraChunkStream(
  response: AgentStreamResponse,
  onFinish?: (text: string) => Promise<void> | void,
): ReadableStream<unknown> {
  let assistantText = "";
  return new ReadableStream<unknown>({
    async start(controller) {
      await response.processDataStream({
        onChunk: async (chunk) => {
          // accumulate text deltas — chunk shape: { type: 'text', text } | { type: 'text-delta', textDelta }
          const c = chunk as { type?: string; text?: string; textDelta?: string };
          if (typeof c.text === "string") assistantText += c.text;
          if (typeof c.textDelta === "string") assistantText += c.textDelta;
          controller.enqueue(chunk);
        },
      });
      try { await onFinish?.(assistantText); } catch { /* non-critical */ }
      controller.close();
    },
  });
}
```

3. Forward `systemContext` into the Mastra stream options as `system` (verify exact field via `references/embedded-docs.md` — Mastra `agent.stream` accepts a `system` option). If `system` is not directly supported, prepend a synthetic system message into `messages` (fallback path documented inline).

**Why:** This is what makes both turns land in the JSON reliably — the server now sees the full assistant text and persists it exactly once.

### A3. `KEEP` — `apps/web/lib/chat-history-store.ts`

No change. The `fileLock`, `appendMessages` upsert, `getThreadMessages`, `appendHistoryEntry` all work. The bug was in the *callers*, not the store.

> **One optional hardening (not required for the fix):** add `verifyThreadPersisted(threadId, ids)` that re-reads and confirms `ids` are present; throw a typed error if not. Wire into A1's `onFinish`. ~15 lines, add to the bottom of the file.

### A4. `MODIFY` — `packages/ai-ui/src/components/llm/agent-chat.tsx`

**Why:** Remove the unreliable client persist effect and send stable ids.

**Change:**

1. **Delete** `agent-chat.tsx:282-313` (the `prevBusyRef` + `busy→idle` persist effect).
2. **Delete** the `onMessagesPersisted` prop usage inside that effect — keep the prop on the component signature for back-compat but stop calling it from a persist path. (Graph refresh moves to Section F.)
3. In the `transport`'s `prepareSendMessagesRequest` (`agent-chat.tsx:241-263`), add the **last user message id** to the body so the server can reuse it as the stable id:

```ts
prepareSendMessagesRequest({ messages, id, body }) {
  const lastMessage = messages.at(-1);
  return {
    body: {
      ...body,
      agentId,
      messages: lastMessage ? [lastMessage] : messages,
      lastUserMessageId: lastMessage?.id,          // ← NEW stable id
      memory: { thread, resource: memoryResource },
      requestContext: { /* ...unchanged... */ },
    },
  };
}
```

4. **Keep** the history-load effect (`agent-chat.tsx:208-235`) — restore still works, now against reliable data.
5. **Keep** `persistedMessageIdsRef` seeding (`agent-chat.tsx:221`) — still used to avoid re-rendering loops even though persistence moved server-side.

### A5. `KEEP`

- `apps/web/app/api/chat/history/route.ts` (GET + POST) — unchanged.
- `apps/web/app/api/history/route.ts` — unchanged.
- `packages/ai-ui/src/hooks/use-chat-thread.ts` — unchanged.
- `apps/web/app/page.tsx` thread-id lifecycle (`page.tsx:65-74`) — unchanged.

---

## Section B — Knowledge graph: split into two kinds

### B1. `MODIFY` — `apps/agent/src/mastra/db/schema.ts`

**Lines:** `GRAPH_SCHEMA_STATEMENTS` (`schema.ts:3-49`).

**Change:** add a `graph_kind` column to `graph_nodes` with a default, plus a new `USER` hub helper. Because LibSQL won't `ALTER` existing tables on `CREATE TABLE IF NOT EXISTS`, add an idempotent migration statement.

Append to `GRAPH_SCHEMA_STATEMENTS` (do not edit the existing CREATEs — they already ran on your DB):

```ts
// Idempotent column add for existing DBs (no-op if column exists)
`ALTER TABLE graph_nodes ADD COLUMN graph_kind TEXT DEFAULT 'exploration'`,  // wrap in try/catch per statement — see B1b
// Index for fast preference lookup (always injected)
`CREATE INDEX IF NOT EXISTS idx_graph_nodes_kind ON graph_nodes(user_id, graph_kind)`,
```

**B1b.** Wrap each statement execution in `ensureGraphSchema` (`schema.ts:60-62`) in a try/catch so an `ALTER TABLE ... ADD COLUMN` that already exists (LibSQL error) does not abort the rest of the schema init:

```ts
for (const statement of GRAPH_SCHEMA_STATEMENTS) {
  try { await db.execute(statement); }
  catch (e) { /* column already exists — expected on second boot */ }
}
```

### B2. `MODIFY` — `apps/agent/src/mastra/db/graph-service.ts`

**Why:** Support two kinds, a USER hub node, and a dedicated preference reader.

**Changes:**

1. Extend `GraphNodeType` (`graph-service.ts:4`) — add `'system'` (the USER hub):

```ts
export type GraphNodeType = 'topic' | 'entity' | 'concept' | 'preference' | 'system';
```

2. Extend `UpsertTopicInput` (`graph-service.ts:45-52`) with `graphKind?: 'exploration' | 'preference'` (default `'exploration'`).
3. In `upsertNodes` (`graph-service.ts:105-149`), include `graph_kind` in the INSERT + ON CONFLICT update:

```ts
sql: `INSERT INTO graph_nodes (id, user_id, label, node_type, graph_kind, frequency, avg_score, first_seen, last_seen, metadata)
      VALUES (?, ?, ?, ?, ?, 1, 0.5, datetime('now'), datetime('now'), ?)
      ON CONFLICT(id) DO UPDATE SET
        frequency = frequency + 1,
        last_seen = datetime('now'),
        graph_kind = COALESCE(excluded.graph_kind, graph_nodes.graph_kind),
        metadata = COALESCE(excluded.metadata, graph_nodes.metadata)`,
args: [id, userId, label.trim(), nodeType, topic.graphKind ?? 'exploration', metadata],
```

4. **Add new function** `getUserHub(userId): Promise<GraphNode>` — lazily creates a single `node_type='system'`, `graph_kind='preference'` node labeled "USER" for the user (id: `${userId}:user-hub`). Used as the anchor for all preference nodes.
5. **Add new function** `getUserPreferences(userId, opts?): Promise<GraphNode[]>` — selects `graph_kind='preference'` nodes for the user, ordered by `avg_score DESC, frequency DESC`, limited (default 12). This is the always-injected set.
6. **Add new function** `upsertPreferenceNode({ userId, label, score, source }): Promise<GraphNode>` — creates/strengthens a preference node, ensures an edge from the USER hub (`edge_type='preference'`), and applies `score` via `updateNodeScores`.
7. **Extend** `getGraph` (`graph-service.ts:196-251`) — accept an optional `graphKind?: 'exploration' | 'preference' | 'all'` filter; default `'all'` so the UI keeps working. When `'all'`, also return the USER hub so the renderer can center preferences on it.

### B3. `MODIFY` — `apps/agent/src/mastra/tools/topic-extractor.ts`

**Why:** Make extraction **deterministic** on substantive turns (graph always grows), tagged `exploration`.

**Change:** The tool stays LLM-callable for backwards compatibility, but add a parallel **server-side deterministic caller** (see C3) that calls the same `execute` with `graphKind: 'exploration'`. The tool itself gains:

- `graphKind` in input schema (default `'exploration'`).
- Pass-through to `upsertNodes(..., { graphKind: input.graphKind })`.

No behavior change to existing LLM invocations.

### B4. `MODIFY` — `apps/agent/src/mastra/tools/graph-query.ts`

**Lines:** `graph-query.ts:38-89`.

**Change:** Accept `graphKind` in input schema; when omitted, return both kinds but **annotate** the summary with the preferences section (so the LLM sees them even on history queries):

```ts
const preferences = graph.nodes.filter(n => n.graphKind === 'preference' || n.nodeType === 'preference');
// add to summary: "User preferences: concise answers (0.9), code examples (0.8)…"
```

### B5. `MODIFY` — `apps/web/app/api/graph/route.ts`

**Lines:** `graph/route.ts:30-66`.

**Change:** Add `graphKind` query param (`?graphKind=preference|exploration|all`, default `all`) and forward to `executeAgentTool`. Add it to the `data` payload.

### B6. `MODIFY` — `packages/ai-ui/src/hooks/use-knowledge-graph.ts`

**Lines:** `GraphData`/`GraphNode` types (`use-knowledge-graph.ts:5-31`), `fetchGraph` (`:353-388`).

**Change:**

1. Add `graphKind?: 'all' | 'preference' | 'exploration'` to `GraphFilters` and to the `useKnowledgeGraph` signature (default `'all'`).
2. Add `graphKind` to the URLSearchParams.
3. Add `graphKind` to `GraphNode` so the renderer can color/style by kind.
4. Keep the demo fallback and 5-min localStorage cache — unchanged.

### B7. `MODIFY` — `packages/ai-ui/src/components/graph/KnowledgeGraph.tsx`

**Why:** Premium two-graph UX.

**Change:**

1. Add a **segmented control** at the top: `Exploration | Preferences | Both`. Switching sets `graphKind` on the hook.
2. **Center the USER hub** when `Preferences` or `Both` is active — render the hub as the fixed center node (distinct glyph, premium glow).
3. Color preferences by `avgScore` (green→amber→red) and exploration by `nodeType` (existing mapping).
4. Keep the existing BFS reveal, float/breathe, search, zoom/pan/drag, NodeDetail panel.

> Design notes (apply skills `ui-ux-pro-max`, `vercel-react-best-practices`, `design-md`): 44px touch targets, `prefers-reduced-motion` respect, `Suspense` + skeleton for the segmented swap, keyboard accessible segmented control (`role="tablist"`).

---

## Section C — LLM judge replaces regex tool routing

### C1. `CREATE` — `apps/web/lib/intent-judge.ts`

**Why:** Replace brittle regex with an LLM classifier that also picks tool order and gates behavior context.

**Design:** Use `generateObject` from AI SDK v6 (available — confirmed in `index.d.ts:6443`) with a tiny, fast model (`getMemoryModel` equivalent, e.g. `openai/gpt-5-mini` or the active provider's memory model) and a Zod schema. Falls back to the regex router if the judge errors (latency/timeout) so chat never breaks.

```ts
import { generateObject } from "ai";
import { z } from "zod";

const IntentSchema = z.object({
  intent: z.enum(["smalltalk", "substantive", "history", "providers", "preference_feedback"]),
  toolOrder: z.array(z.string()),          // agent tool-object keys, priority order
  useBehaviorContext: z.boolean(),         // gate the history/scoring path
  reason: z.string(),
});

export type Judgment = z.infer<typeof IntentSchema>;

export async function classifyIntentLLM(messages: NormalizedChatMessage[]): Promise<Judgment> {
  const lastUser = [...messages].reverse().find(m => m.role === "user");
  try {
    const { object } = await generateObject({
      model: resolveJudgeModel(),               // small/cheap model
      schema: IntentSchema,
      system: JUDGE_SYSTEM_PROMPT,              // lists available tools + when to use each
      prompt: lastUser?.content ?? "",
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(2500),   // hard cap
    });
    return object;
  } catch {
    // Fallback to the existing regex router (keeps chat alive)
    return regexFallback(lastUser?.content ?? "");
  }
}
```

**`JUDGE_SYSTEM_PROMPT` rules:**

- `smalltalk` → `toolOrder: []`, `useBehaviorContext: false`.
- `substantive` → `toolOrder: ["topicExtractorTool", "graphQueryTool"]`, `useBehaviorContext: true`.
- `history` → `toolOrder: ["graphQueryTool", "listThreadsTool", "topicExtractorTool"]`, `useBehaviorContext: true`.
- `providers` → `toolOrder: ["getAvailableProvidersTool"]`, `useBehaviorContext: false`.
- `preference_feedback` (e.g. "I wish you were more concise") → `toolOrder: []`, `useBehaviorContext: true`, and signal the preference writer (Section D) to upsert a preference node.

### C2. `MODIFY` — `apps/web/lib/tool-router.ts`

**Why:** Keep it as the **fallback**. Don't delete — it's the safety net for `classifyIntentLLM`.

**Change:**

1. Export a new `regexFallback(message): Judgment` that calls the existing `routeTools` and maps the result to the `Judgment` shape (C1). Keep `routeTools` and `classifyIntent` exported for tests.
2. Add `useBehaviorContext` derivation: `true` for `substantive`/`history`, `false` otherwise.

### C3. `CREATE` — `apps/web/lib/deterministic-topics.ts`

**Why:** Guarantee the exploration graph grows even when the LLM forgets to call the tool.

**Design:** A tiny helper invoked from `route.ts` `onFinish` on substantive turns. It calls `executeAgentTool("topic-extractor")` with `graphKind: "exploration"`, passing `{ userId, threadId, messageId, userMessage, assistantMessage }`. Wrap in try/catch + `AbortSignal.timeout` so a failure never breaks chat. The LLM is still *allowed* to call `topicExtractorTool` for richer extraction — this is the floor, not the ceiling.

### C4. `MODIFY` — `apps/agent/src/mastra/tools/topic-extractor.ts`

(Already covered in B3 — adds `graphKind` param.)

### C5. `MODIFY` — `apps/agent/src/mastra/agents/aria-agent.ts`

**Lines:** `aria-agent.ts:62-90` (instructions).

**Change:** Update the instructions to reflect that topic extraction is now **also** deterministic, so the LLM should focus on quality extraction when it does call the tool, not worry about missing it. Add a short line:

> "Topic extraction also runs automatically after substantive turns; your call enriches it — prefer specific, reusable labels."

Keep memory config (`aria-agent.ts:28-61`) **untouched**.

---

## Section D — Preferences: always injected before every response

### D1. `CREATE` — `apps/web/lib/preference-injection.ts`

**Why:** Single source of truth for building the always-on preference system block.

```ts
export function renderPreferenceBlock(nodes: GraphNode[]): string {
  if (nodes.length === 0) return "";
  const lines = nodes.map(n => `- ${n.label} (confidence ${(n.avgScore*100).toFixed(0)}%)`);
  return `\n\n## ALWAYS APPLY — User Preferences\nThe following preferences are confirmed. Honor them in every response:\n${lines.join("\n")}\n`;
}
```

### D2. `MODIFY` — `apps/web/app/api/chat/route.ts`

(Already wired in A1 — `getUserPreferences(userId)` → `renderPreferenceBlock` → `systemContext`.)

### D3. `MODIFY` — `apps/agent/src/mastra/db/graph-service.ts`

`getUserPreferences` added in B2 — reused here. No further change.

---

## Section E — Behavior context: history-derived, gated by relevance

### E1. `CREATE` — `apps/web/lib/behavior-context.ts`

**Why:** Compute a behavior score from exploration history and render it into the system block — only when `judgment.useBehaviorContext === true`.

**Design:**

- Input: recent `exploration` nodes (top-N by frequency/score) + recent threads (from `list-threads` or the JSON store).
- Output: a short behavior block:

```
## User Behavior Profile (relevant to this query)
- Depth preference: detailed (inferred from 8 deep-dive threads)
- Recurring focus: vector databases, RAG, embeddings
- Avoid: long preambles (downvoted 3x)
```

- Heuristic now, LLM-summarized later (Phase 2). Score derived from feedback-weighted exploration nodes — high `avgScore` topics = reinforce, low `avgScore` = avoid.

### E2. `MODIFY` — `apps/web/app/api/chat/route.ts`

In the `systemContext` builder (A1), append `renderBehaviorBlock(history)` **only if** `judgment.useBehaviorContext`. This is the "only when relevant" gate.

---

## Section F — Feedback that actually shapes the graph + future responses

### F1. `MODIFY` — `apps/agent/src/mastra/tools/feedback-recorder.ts`

**Lines:** `feedback-recorder.ts:36-70`.

**Why:** Feedback must write a **preference node**, not just bump topic scores — so the always-injected preferences (Section D) actually change the next answer.

**Change:**

```ts
execute: async (input, context) => {
  const userId = input.userId ?? requestContextValue(context, "userId") ?? "anonymous-user";
  const threadId = input.threadId ?? requestContextValue(context, "threadId") ?? "anonymous-thread";
  const score = computeFeedbackScore(input);

  // 1) record raw feedback (unchanged)
  await recordFeedback({ /* ... */ });

  // 2) NEW: derive a preference label from the feedback + comment
  const prefLabel = await derivePreferenceLabel(input);   // F2: small LLM call or rule map
  if (prefLabel) {
    await upsertPreferenceNode({ userId, label: prefLabel, score, source: "feedback" });   // B2
  }

  // 3) KEEP existing behavior: also nudge recent exploration nodes (backward compat)
  const updatedNodeIds = input.nodeIds?.length ? input.nodeIds : await getRecentNodeIds(userId);
  await updateNodeScores(updatedNodeIds, score);

  return { score, updatedNodeIds, preferenceLabel: prefLabel, message: /* ... */ };
}
```

### F2. `CREATE` — `apps/agent/src/mastra/tools/derive-preference.ts`

**Why:** Map feedback to a reusable preference label.

**Design:** Rule map first (fast, deterministic), LLM fallback for comments:

| Input | Preference label |
|---|---|
| thumbs up + comment "concise" | `concise answers` |
| thumbs down + comment "too long" | `avoid verbosity` |
| rating ≤ 2 | `needs different approach: <inferred>` |
| rating ≥ 4 | `reinforce: <inferred>` |

LLM fallback: one `generateObject` call with the comment text → `{ label, confidence }`, timeout 2s, fall back to `"general sentiment: positive/negative"`.

### F3. `MODIFY` — `apps/web/app/api/feedback/route.ts`

**Lines:** `route.ts:41-56`.

**Change:** Forward `nodeIds` if the client knows them (optional). No structural change — the tool now writes preferences internally.

### F4. `MODIFY` — `packages/ai-ui/src/components/chat/FeedbackBar.tsx`

**Why (premium UX):** Show that feedback writes a preference; reflect the new closed loop in the UI.

**Changes:**

1. After submit, the success state (`FeedbackBar.tsx:66-73`) shows the **preference label** returned by the tool (e.g. "Saved preference: concise answers"). Requires the API to return `preferenceLabel` (F1) and `onSubmit` to bubble it back — extend `FeedbackPayload`/return type in `agent-chat.tsx:315` (`submitFeedback`) to surface it.
2. Premium micro-interactions: optimistic thumb state, subtle haptic-style scale, `prefers-reduced-motion` guard. Apply `vercel-react-best-practices` (no layout thrash, `useTransition` for submit).
3. Keep thumbs / star / comment structure — visual upgrade only.

### F5. `MODIFY` — `apps/web/app/page.tsx`

**Lines:** `handleFeedbackSubmitted` (`page.tsx:140-160`).

**Change:**

- Keep `refreshGraph()`.
- **Remove** the redundant `POST /api/history` call (`page.tsx:146-159`) — feedback now writes preferences via the tool (F1), and the history `feedbackCount` is updated inside `feedback-recorder` (add a `appendHistoryEntry` call there for the count). This removes a second, conflicting writer and keeps `chat-history.json` consistent.

---

## Section G — Schema migration & index.ts wiring

### G1. `MODIFY` — `apps/agent/src/mastra/index.ts`

**Change:** Register the **USER hub bootstrap** on startup (after `ensureGraphSchema`):

```ts
import { ensureUserHubs } from './db/graph-service';
void ensureGraphSchema().then(() => ensureUserHubs()).catch(/* ... */);
```

Add `ensureUserHubs()` to `graph-service.ts` — creates the hub for the known local user(s). For MVP (single user `aria-local-user`) this is one row.

### G2. `KEEP` (verified)

- `apps/agent/src/mastra/storage.ts` — LibSQL store/vector/embedder unchanged.
- `apps/agent/src/mastra/config/model-providers.ts` — provider/model resolution unchanged (judge reuses `getMemoryModel`).
- `apps/agent/src/mastra/scorers/feedback-scorer.ts` — scoring formula unchanged (`computeFeedbackScore`).
- `apps/agent/src/mastra/scorers/feedback-scorers.ts` — evals scorers unchanged.
- `apps/agent/src/mastra/agents/feedback-summarizer.ts` — unchanged.
- Guardrails (`mastra-guardrails.ts`) — unchanged.
- `apps/web/app/api/threads/route.ts` + `list-threads` tool — unchanged (still the source for topics/counts).

---

## 3. File inventory (single source of truth for the executor)

| # | File | Status | Section | Step (§5) |
|---|---|---|---|---|
| 1 | `apps/web/app/api/chat/route.ts` | MODIFY | A1 (split: A1a/A1b/A1c) | 5, 10, 12 |
| 2 | `apps/web/lib/mastra-client.ts` | MODIFY | A2 | 4 |
| 3 | `apps/web/lib/chat-history-store.ts` | KEEP (+optional A3 verify fn) | A3 | — |
| 4 | `packages/ai-ui/src/components/llm/agent-chat.tsx` | MODIFY | A4 | 6 |
| 5 | `apps/agent/src/mastra/db/schema.ts` | MODIFY | B1 | 1 |
| 6 | `apps/agent/src/mastra/db/graph-service.ts` | MODIFY | B2, D3, G1 | 2 |
| 7 | `apps/agent/src/mastra/tools/topic-extractor.ts` | MODIFY | B3, C4 | 18 |
| 8 | `apps/agent/src/mastra/tools/graph-query.ts` | MODIFY | B4 | 18 |
| 9 | `apps/web/app/api/graph/route.ts` | MODIFY | B5 | 19 |
| 10 | `packages/ai-ui/src/hooks/use-knowledge-graph.ts` | MODIFY | B6 | 20 |
| 11 | `packages/ai-ui/src/components/graph/KnowledgeGraph.tsx` | MODIFY | B7 | 21 |
| 12 | `apps/web/lib/intent-judge.ts` | CREATE | C1 | 8 |
| 13 | `apps/web/lib/tool-router.ts` | MODIFY | C2 | 7 |
| 14 | `apps/web/lib/deterministic-topics.ts` | CREATE | C3 | 9 |
| 15 | `apps/agent/src/mastra/agents/aria-agent.ts` | MODIFY | C5 | 10 |
| 16 | `apps/web/lib/preference-injection.ts` | CREATE | D1 | 11 |
| 17 | `apps/web/lib/behavior-context.ts` | CREATE | E1 | 12 |
| 18 | `apps/agent/src/mastra/tools/feedback-recorder.ts` | MODIFY | F1 | 14 |
| 19 | `apps/agent/src/mastra/tools/derive-preference.ts` | CREATE | F2 | 13 |
| 20 | `apps/web/app/api/feedback/route.ts` | MODIFY | F3 | 15 |
| 21 | `packages/ai-ui/src/components/chat/FeedbackBar.tsx` | MODIFY | F4 | 16 |
| 22 | `apps/web/app/page.tsx` | MODIFY | F5 | 17 |
| 23 | `apps/agent/src/mastra/index.ts` | MODIFY | G1 | 3 |

**Totals:** 17 MODIFY · 5 CREATE · 1 KEEP (plus optional `verifyThreadPersisted` in #3) · 11 untouched.
**Execution:** 21 atomic steps across 6 phases — follow §5 strictly.

**Untouched (verified working — do not edit):** `storage.ts`, `model-providers.ts`, `feedback-scorer.ts`, `feedback-scorers.ts`, `feedback-summarizer.ts`, `mastra-guardrails.ts`, `threads/route.ts`, `list-threads.ts`, `chat/history/route.ts`, `history/route.ts`, `use-chat-thread.ts`.

---

## 4. Skill alignment (premium app)

| Skill | Where applied | How |
|---|---|---|
| `mastra` | C1, A2, F1 | Verify `generateObject`, `agent.stream` `system` option, `executeTool` against `node_modules/@mastra/*/dist/docs` before writing — never trust memory |
| `design-md` | B7, F4 | Tokenize the segmented graph control + preference hub into the existing ARIA semantic tokens (`--aria-accent`, `--aria-surface-raised`) so the new UI matches the system |
| `ui-ux-pro-max` | B7, F4 | Apply the "dashboard/analytics" style + 57 font/161 palette guidance for the preference cluster colors (green→amber→red semantic) |
| `vercel-react-best-practices` | A4, B6, B7, F4 | `useTransition` for feedback submit, `Suspense` + skeleton on graph kind switch, memoized filtered nodes/edges (already present), no layout thrash on segmented control |

---

## 5. Step-by-step execution order

> Follow these 21 steps **in order**. Each step is atomic: it compiles cleanly on its own.
> **After every step:** run `pnpm check-types && pnpm lint`. Stop and fix before the next step.
> **Phase boundaries (P1–P6):** each is independently shippable — see §0.3.

### Phase P1 — Foundation (graph schema + service)

| Step | Block | File(s) | Does | Depends on |
|---|---|---|---|---|
| **1** | **B1** | `apps/agent/src/mastra/db/schema.ts` | Add `graph_kind` column (idempotent `ALTER`) + try/catch in `ensureGraphSchema` (B1b) | — |
| **2** | **B2** | `apps/agent/src/mastra/db/graph-service.ts` | Extend `GraphNodeType`/`UpsertTopicInput`; add `graph_kind` to `upsertNodes`; add `getUserHub`, `getUserPreferences`, `upsertPreferenceNode`, `ensureUserHubs`; extend `getGraph` with `graphKind` filter | Step 1 |
| **3** | **G1** | `apps/agent/src/mastra/index.ts` | Bootstrap the USER hub on startup via `ensureUserHubs()` | Step 2 |

**Gate:** `pnpm check-types && pnpm lint` green. Boot the agent and confirm `mastra.db` has a `graph_kind` column and one `system`/`USER` hub row.

### Phase P2 — Fix history reliability (single writer)

> **Splitting A1:** the original A1 block mixed the history fix with judge (C) + prefs (D), which don't exist yet → it won't compile. We split it into A1a (minimal, ships now) and A1b (wires judge/prefs, runs in P3/P4 after those exist).

| Step | Block | File(s) | Does | Depends on |
|---|---|---|---|---|
| **4** | **A2** | `apps/web/lib/mastra-client.ts` | Add `systemContext` + `onFinish` to `StreamAgentOptions`; accumulate assistant text in `createMastraChunkStream`; call `onFinish` on close | — |
| **5** | **A1a** | `apps/web/app/api/chat/route.ts` | **Minimal fix only:** delete fire-and-forget block (`route.ts:53-85`); in `onFinish` persist user + assistant with stable client id; wire `verifyThreadPersisted`. **Do NOT** add judge/prefs calls yet (leave those as TODO comments). | Step 4 |
| **6** | **A4** | `packages/ai-ui/src/components/llm/agent-chat.tsx` | Delete client persist effect (`agent-chat.tsx:282-313`); send `lastUserMessageId` in transport body | — |

**Gate:** `pnpm check-types && pnpm lint` green. **Run manual tests #1 and #2** (§9): send a message, reload → both turns restored; send 3 messages → no duplicates. **The core history bug is now fixed and shippable.**

### Phase P3 — LLM judge + deterministic topic floor

| Step | Block | File(s) | Does | Depends on |
|---|---|---|---|---|
| **7** | **C2** | `apps/web/lib/tool-router.ts` | Export `regexFallback(message): Judgment` mapping existing `routeTools` → `Judgment` shape; add `useBehaviorContext` | — |
| **8** | **C1** | `apps/web/lib/intent-judge.ts` (CREATE) | `classifyIntentLLM()` via `generateObject` + Zod; 2.5s timeout; falls back to `regexFallback` | Step 7 |
| **9** | **C3** | `apps/web/lib/deterministic-topics.ts` (CREATE) | `extractTopicsDeterministically()` — calls `executeAgentTool("topic-extractor")` w/ `graphKind:"exploration"`, try/catch + timeout | Step 2 (graphKind) |
| **10** | **A1b** | `apps/web/app/api/chat/route.ts` | **Now wire the judge:** replace the TODO from step 5 with `classifyIntentLLM` → `activeTools`/`toolChoice`; call `extractTopicsDeterministically` in `onFinish` for substantive turns | Steps 8, 9 |
| — | C5 | `apps/agent/src/mastra/agents/aria-agent.ts` | (Tiny edit — do alongside step 10) Update instructions re: deterministic extraction | — |

**Gate:** green checks. **Run test #3:** ask a substantive question → graph gains exploration nodes even if the LLM skipped the tool.

### Phase P4 — Preference + behavior injection

| Step | Block | File(s) | Does | Depends on |
|---|---|---|---|---|
| **11** | **D1** | `apps/web/lib/preference-injection.ts` (CREATE) | `renderPreferenceBlock(nodes)` | — |
| **12** | **A1c** | `apps/web/app/api/chat/route.ts` | Wire `getUserPreferences` → `renderPreferenceBlock` → `systemContext` (always-on); wire `renderBehaviorBlock` **only if** `judgment.useBehaviorContext`. Also create `apps/web/lib/behavior-context.ts` (E1) in this step. | Steps 2, 10, 11 |

**Gate:** green checks. **Run tests #4–5:** "what have I explored?" loads behavior context; "hi" skips tools but still injects prefs; next substantive answer honors preferences.

### Phase P5 — Feedback writes preferences (closes the loop)

| Step | Block | File(s) | Does | Depends on |
|---|---|---|---|---|
| **13** | **F2** | `apps/agent/src/mastra/tools/derive-preference.ts` (CREATE) | `derivePreferenceLabel(input)` — rule map + LLM fallback | — |
| **14** | **F1** | `apps/agent/src/mastra/tools/feedback-recorder.ts` | Add step 2: derive label → `upsertPreferenceNode`; add `appendHistoryEntry` for `feedbackCount`; keep step 3 (nudge topic nodes) | Steps 2, 13 |
| **15** | **F3** | `apps/web/app/api/feedback/route.ts` | Forward optional `nodeIds`; return `preferenceLabel` | Step 14 |
| **16** | **F4** | `packages/ai-ui/src/components/chat/FeedbackBar.tsx` | Surface `preferenceLabel` in success state; premium micro-interactions | Step 15 |
| **17** | **F5** | `apps/web/app/page.tsx` | Keep `refreshGraph()`; remove redundant `POST /api/history` (feedback count now written by F1) | Step 14 |

**Gate:** green checks. **Run tests #6–7:** thumbs-down "too long" → `avoid verbosity` preference created → next answer shorter; thumbs-up concise → preference reinforced.

### Phase P6 — Two-graph premium UI

| Step | Block | File(s) | Does | Depends on |
|---|---|---|---|---|
| **18** | **B3/B4** | `topic-extractor.ts`, `graph-query.ts` | Add `graphKind` param; annotate summary with preferences | Step 2 |
| **19** | **B5** | `apps/web/app/api/graph/route.ts` | Add `graphKind` query param → forward to tool | Step 18 |
| **20** | **B6** | `packages/ai-ui/src/hooks/use-knowledge-graph.ts` | `graphKind` in filters/types/fetch | Step 19 |
| **21** | **B7** | `packages/ai-ui/src/components/graph/KnowledgeGraph.tsx` | Segmented control (Exploration \| Preferences \| Both); center USER hub; score-colored prefs | Step 20 |

**Gate:** green checks. **Run tests #8–10:** three tabs render correctly; hub centers preferences; combined view clusters cleanly.

### Rollout checkpoints

- After **P2** → ship-able: history works. (Highest-value, lowest-risk phase.)
- After **P3** → ship-able: intelligence improved, behavior unchanged for users.
- After **P5** → full adaptive loop closed.
- After **P6** → premium two-graph UX complete.

**Final:** update `MVP_PROGRESS.md` per §10, run the full §9 matrix once more end-to-end.

---

## 6. New env / config

- No new required env vars. The judge reuses `LLM_MEMORY_MODEL` / the active provider.
- Optional: `ARIA_JUDGE_TIMEOUT_MS` (default 2500), `ARIA_JUDGE_MODEL` (override judge model).

---

## 7. Backward-compat & safety

- **Two writers → one:** done by deletion (A1, A4). No migration of existing data needed — the JSON file is append-only and the new writer produces the same `HistoryEntry` shape.
- **`graph_kind` column:** added via idempotent `ALTER TABLE ... ADD COLUMN` wrapped in try/catch (B1b). Existing rows default to `'exploration'`. No data loss.
- **LLM judge failure** → regex fallback (C2) → chat never breaks.
- **Deterministic topics failure** → swallowed (C3) → graph just doesn't grow that turn.
- **Preference derivation failure** → raw feedback still recorded (F1 step 1 always runs; step 2 wrapped in try/catch).
- **No breaking API contract changes** to `/api/chat`, `/api/feedback`, `/api/graph` — new params are optional.

---

## 8. Risks & open decisions

| Risk | Mitigation |
|---|---|
| `agent.stream` may not accept a `system` option directly | Fallback: prepend a synthetic system message into `messages`. Verify in `node_modules/@mastra/core/dist/docs` before A2. |
| LLM judge adds ~300-800ms latency on first token | Use the memory model (cheap), 2.5s timeout, regex fallback. Can be parallelized with guardrails if needed. |
| `topicExtractorTool` called twice (LLM + deterministic) → duplicate frequency++ | Deterministic caller (C3) passes `messageId`; `upsertNodes` is idempotent per `node_id`; co-occurrence edges de-dup via the `UNIQUE(source_id,target_id,edge_type)` constraint. Net effect: at most +1 extra weight, acceptable. |
| Feedback comment may not map cleanly to a preference | F2 falls back to `"general sentiment: positive/negative"` — still useful, never throws. |

---

## 9. Manual test matrix (run after full rollout)

| # | Test | Expected (after overhaul) |
|---|---|---|
| 1 | Send a chat message, wait for full reply, reload page | Both user **and** assistant messages restored; `lastResult` populated in JSON |
| 2 | Send 3 messages in one thread, reopen | No duplicate user messages; messageCount accurate |
| 3 | Ask a substantive question | Graph gains 2-5 exploration nodes **even if** the LLM didn't call the tool |
| 4 | Ask "what have I explored?" | Behavior context loads; answer references recurring topics |
| 5 | Say "hi" | No tools called; preferences still injected (system block); fast response |
| 6 | Thumbs-down a verbose answer with comment "too long" | A `avoid verbosity` preference node created; **next** answer is shorter |
| 7 | Thumbs-up a concise answer | `concise answers` preference reinforced; preference score rises |
| 8 | Open graph, switch to **Preferences** tab | USER hub center, preference nodes radiate, colored by score |
| 9 | Switch to **Exploration** tab | Topic nodes by type, existing behavior |
| 10 | Switch to **Both** | Combined view, hub anchors preferences, topics cluster separately |

---

## 10. Alignment with `MVP_PROGRESS.md`

After execution, update `MVP_PROGRESS.md`:

- **§2 Architecture diagram:** add the LLM judge node, preference-injection arrow, two `graph_kind` stores.
- **§4 History:** replace the "busy→idle" description with "server-side `onFinish` single writer".
- **§5 Knowledge Graph:** add the two-kind split + segmented control.
- **§6 Feedback:** replace "recolors nodes" with "writes preference nodes → always injected → next response changed".

This keeps the university report consistent with the implemented system.

---

**End of plan.** Execute top-to-bottom, run `pnpm check-types && pnpm lint` after each section, and the §9 test matrix at the end.
