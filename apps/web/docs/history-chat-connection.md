# History ↔ Chat Connection

## 1. Overview

The ARIA home page (`apps/web/app/page.tsx`) is a three-pane workspace:

| Pane   | Width | Component                  | Responsibility                          |
| ------ | ----- | -------------------------- | --------------------------------------- |
| Left   | 20%   | `ChatHistory`              | List past threads; switch / create new  |
| Center | 60%   | `AgentChat`                | Render the active thread; send messages |
| Right  | 20%   | `KnowledgeGraph`           | Visualize topics from all threads       |

The **history sidebar** and the **chat panel** are decoupled components that share a single piece of controlled state: `currentThreadId`. Neither component knows about the other directly — `page.tsx` is the orchestrator. This document traces the full data flow from "user clicks a thread in the sidebar" to "that thread's messages appear in the chat."

---

## 2. Component roles

### `ChatHistory` (sidebar)

**File:** `packages/ai-ui/src/components/history/ChatHistory.tsx`

Read-only list of past conversations. It does **not** own which thread is active — it receives `currentThreadId` as a prop and calls `onSelectThread(threadId)` / `onNewChat()` callbacks when the user interacts.

| Prop               | Type                          | Purpose                                  |
| ------------------ | ----------------------------- | ---------------------------------------- |
| `userId`           | `string`                      | Scopes the thread list to one user       |
| `currentThreadId`  | `string \| null`              | Highlights the active thread             |
| `onNewChat`        | `() => void`                  | Create a fresh thread                    |
| `onSelectThread`   | `(threadId: string) => void`  | Switch to an existing thread             |

On mount it fetches the thread list from two sources in parallel and merges them:

```
GET /api/threads?userId=...   → Mastra memory threads (id, counts, topics)
GET /api/history?userId=...   → JSON-file entries (lastQuery, lastResult, counts)
```

### `AgentChat` (center)

**File:** `packages/ai-ui/src/components/llm/agent-chat.tsx`

Renders the conversation for a single thread and streams new messages. It accepts a **controlled** `threadId` prop. When the parent changes that prop, the component **remounts** (via React `key`), which resets its internal `useChat` state and re-fetches that thread's persisted messages from the server.

| Prop                | Type                  | Purpose                                        |
| ------------------- | --------------------- | ---------------------------------------------- |
| `threadId`          | `string \| null`      | Controlled thread id; remount trigger on change |
| `userId`            | `string`              | Memory resource id + history persistence scope  |
| `agentId`           | `string`              | Mastra agent to stream from                    |
| `onMessagesPersisted` | `() => void`        | Notifies parent after new messages are saved   |
| `onFeedbackSubmitted` | `(payload) => void` | Notifies parent after feedback is recorded     |

### `page.tsx` (orchestrator)

**File:** `apps/web/app/page.tsx`

Owns `currentThreadId` as React state and wires the two components together:

```tsx
const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

// Restore or create the thread id on first mount
useEffect(() => {
  const existing = sessionStorage.getItem("aria-chat-thread-id");
  if (existing) setCurrentThreadId(existing);
  else {
    const next = createThreadId();
    sessionStorage.setItem("aria-chat-thread-id", next);
    setCurrentThreadId(next);
  }
}, []);

// Sidebar → state (no page reload)
const handleSelectThread = useCallback((threadId: string) => {
  sessionStorage.setItem("aria-chat-thread-id", threadId);
  setCurrentThreadId(threadId);
}, []);

const handleNewChat = useCallback(() => {
  const next = createThreadId();
  sessionStorage.setItem("aria-chat-thread-id", next);
  setCurrentThreadId(next);
}, []);
```

Both handlers update state **without** `window.location.reload()`. The chat panel swaps content inline.

---

## 3. End-to-end flow: selecting a thread

```
┌─────────────┐      onSelectThread(id)       ┌─────────────┐
│ ChatHistory │ ─────────────────────────────▶ │  page.tsx   │
│  (sidebar)  │                                │ (orchestr.) │
└─────────────┘                                └──────┬──────┘
                                                      │ setCurrentThreadId(id)
                                                      ▼
                                              ┌───────────────┐
                                              │ currentThreadId│
                                              │  (state)       │
                                              └──────┬────────┘
                                                     │ passed as prop + key
                                                     ▼
┌───────────────┐  key={id} remount   ┌──────────────────────────┐
│ AgentChat     │ ◀────────────────── │  <AgentChat key={id}     │
│ (new instance)│                     │     threadId={id} ... /> │
└───────┬───────┘                     └──────────────────────────┘
        │ useEffect([threadId])
        ▼
GET /api/chat/history?threadId={id}
        │
        ▼
┌──────────────────────┐
│ chat-history-store.ts│  →  data/chat-history.json
│  getThreadMessages() │     (serialized via fileLock)
└──────────────────────┘
        │ StoredMessage[]
        ▼
┌──────────────────────┐
│ storedMessageToUIMsg │  →  UIMessage[]
└──────────────────────┘
        │ setMessages(uiMessages)
        ▼
   Conversation renders past turns inline
```

### Why a `key` remount?

`useChat` from `@ai-sdk/react` holds message state internally. Changing the `threadId` prop alone would **not** clear the previous thread's messages — the hook would append the new thread's history on top of the old one. By passing `key={currentThreadId}`, React unmounts the old `AgentChatInner` instance and mounts a fresh one, so:

1. `useChat` initializes with an empty message array.
2. The `loadHistory` effect fires for the new `threadId`.
3. `setMessages(historyMessages)` populates the conversation cleanly.

No page reload, no flicker of stale messages.

---

## 4. End-to-end flow: sending a message

```
User types in AgentChat
        │ sendMessage({ text })
        ▼
POST /api/chat  (DefaultChatTransport)
        │
        ├─ normalizeChatRequest()
        ├─ runInputGuardrails()
        ├─ routeTools(lastUserMessage)   ← tool routing layer
        ├─ streamAgentToAiSdk({ activeTools, toolChoice, ... })
        │        │
        │        ▼
        │   Mastra Agent stream  →  AI SDK parts  →  UI
        │
        └─ Fire-and-forget persistence:
            ├─ appendHistoryEntry({ threadId, userId, ... })
            └─ appendMessages(threadId, userMessages, userId)
                    │
                    ▼
              data/chat-history.json  (serialized via fileLock)
```

When the stream transitions from busy → idle, `AgentChat` also persists the **assistant's** response:

```
useChat status: streaming → idle
        │
        ▼
POST /api/chat/history  { threadId, userId, messages: newMessages }
        │
        ▼
appendMessages()  →  updates lastQuery, lastResult, messageCount
        │
        ▼
onMessagesPersisted()  →  page.tsx refreshGraph()
```

The graph refresh is the only side effect that reaches the right pane; the sidebar updates its preview on the next `fetchThreads()` call (triggered by the Refresh button or a future poll).

---

## 5. Persistence layer

**File:** `apps/web/lib/chat-history-store.ts`

All reads and writes go through a single JSON file (`data/chat-history.json`). A promise-chain `fileLock` serializes every operation so concurrent fire-and-forget calls from the chat route don't clobber each other.

```
appendHistoryEntry()  ─┐
                       ├── withFileLock() ──▶ read ──▶ mutate ──▶ write
appendMessages()      ─┘
getThreadMessages()   ─── withFileLock() ──▶ read
getHistoryEntries()   ─── withFileLock() ──▶ read
```

`appendMessages` uses **upsert** semantics: if no entry exists yet for the thread (race with `appendHistoryEntry`), it creates a minimal entry on the fly instead of silently dropping the messages.

### Entry shape

```ts
type HistoryEntry = {
  threadId: string;
  userId: string;
  firstMessage: string;
  topics: string[];
  createdAt: string;
  lastActive: string;
  messageCount: number;
  feedbackCount: number;
  messages: StoredMessage[];   // capped at 50 per thread
  lastQuery?: string;          // sidebar preview — last user msg
  lastResult?: string;         // sidebar preview — last assistant msg
};
```

---

## 6. API endpoints involved

| Endpoint                      | Method | Used by        | Purpose                                    |
| ----------------------------- | ------ | -------------- | ------------------------------------------ |
| `/api/threads?userId=`        | GET    | `ChatHistory`  | List threads from Mastra memory            |
| `/api/history?userId=`        | GET    | `ChatHistory`  | List entries from JSON store (previews)    |
| `/api/history`                | POST   | `page.tsx`     | Update feedback count on a thread          |
| `/api/chat`                   | POST   | `AgentChat`    | Stream a response; fire-and-forget persist |
| `/api/chat/history?threadId=` | GET    | `AgentChat`    | Load past messages when a thread opens     |
| `/api/chat/history`           | POST   | `AgentChat`    | Persist new user + assistant messages      |
| `/api/feedback`               | POST   | `AgentChat`    | Record feedback (out-of-band, not LLM)     |

---

## 7. Thread id lifecycle

```
┌──────────────────────┐
│  First page load     │
│  sessionStorage empty│
└──────────┬───────────┘
           │ createThreadId() → crypto.randomUUID()
           ▼
┌──────────────────────┐
│  sessionStorage      │
│  aria-chat-thread-id │
└──────────┬───────────┘
           │ setCurrentThreadId(id)
           ▼
┌──────────────────────┐         click "New"          ┌─────────────────┐
│  Active conversation │ ───────────────────────────▶ │ createThreadId()│
│  (state in page.tsx) │                              │ setCurrentThreadId│
└──────────┬───────────┘                              └─────────────────┘
           │ click thread in sidebar
           ▼
┌──────────────────────┐
│  handleSelectThread  │
│  setCurrentThreadId  │
└──────────────────────┘
```

`sessionStorage` survives F5 reloads within the same tab but is cleared when the tab closes — so a reload restores the last-open thread, while a fresh session starts a new one.

---

## 8. What changed in the refactor

| Before                                    | After                                         |
| ----------------------------------------- | --------------------------------------------- |
| `window.location.reload()` on thread switch | Inline state swap + `key` remount (no reload) |
| `useChatThread` owned the id internally   | `page.tsx` owns it; `AgentChat` is controlled |
| `appendMessages` silently no-op'd if entry missing | Upsert creates the entry automatically |
| Concurrent file writes could race         | `fileLock` promise chain serializes all I/O   |
| `userId` not forwarded to `appendMessages` | Forwarded from client + server route          |

---

## 9. File map

```
apps/web/
├── app/
│   ├── page.tsx                      ← orchestrator (currentThreadId state)
│   └── api/
│       ├── chat/route.ts             ← stream + fire-and-forget persist
│       ├── chat/history/route.ts     ← GET/POST messages for one thread
│       ├── history/route.ts          ← GET/POST thread list entries
│       └── threads/route.ts          ← GET Mastra-memory threads
├── lib/
│   ├── chat-history-store.ts         ← JSON store + fileLock + upsert
│   └── mastra-client.ts             ← streamAgentToAiSdk (activeTools)
└── docs/
    └── history-chat-connection.md    ← this file

packages/ai-ui/
└── src/
    ├── components/
    │   ├── history/ChatHistory.tsx   ← sidebar (read-only list)
    │   └── llm/agent-chat.tsx        ← center (controlled threadId + remount)
    └── hooks/
        └── use-chat-thread.ts        ← createThreadId + useChatThread
```
