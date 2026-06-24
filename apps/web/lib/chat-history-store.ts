import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { StoredMessage } from "@repo/ai-ui/lib/types";

// ponytail: StoredMessage is canonical in packages/ai-ui (correct dep direction
// — apps/web already depends on @repo/ai-ui). Re-export so existing callers
// keep `import { StoredMessage } from "./chat-history-store"` working.
export type { StoredMessage };

const DATA_DIR = join(process.cwd(), "data");
const HISTORY_FILE = join(DATA_DIR, "chat-history.json");
const MAX_MESSAGES_PER_THREAD = 50;

/**
 * Simple promise chain that serializes all reads + writes to the history file.
 * Without this, concurrent fire-and-forget calls (appendHistoryEntry and
 * appendMessages from the chat route) race on the same JSON file and silently
 * clobber each other's updates.
 */
let fileLock: Promise<void> = Promise.resolve();

function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = fileLock.then(fn, fn);
  fileLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export type HistoryEntry = {
  threadId: string;
  userId: string;
  firstMessage: string;
  topics: string[];
  createdAt: string;
  lastActive: string;
  messageCount: number;
  feedbackCount: number;
  messages: StoredMessage[];
  lastQuery?: string;
  lastResult?: string;
};

export type HistoryStore = {
  entries: HistoryEntry[];
  updatedAt: string;
};

async function ensureDataDir(): Promise<void> {
  try {
    await mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory already exists — safe to ignore.
  }
}

async function readHistoryUnsafe(): Promise<HistoryStore> {
  try {
    const raw = await readFile(HISTORY_FILE, "utf-8");
    const parsed = JSON.parse(raw) as HistoryStore;

    if (!Array.isArray(parsed.entries)) {
      return { entries: [], updatedAt: new Date().toISOString() };
    }

    return parsed;
  } catch {
    return { entries: [], updatedAt: new Date().toISOString() };
  }
}

async function writeHistoryUnsafe(store: HistoryStore): Promise<void> {
  await ensureDataDir();
  await writeFile(HISTORY_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function readHistory(): Promise<HistoryStore> {
  return withFileLock(() => readHistoryUnsafe());
}

export function writeHistory(store: HistoryStore): Promise<void> {
  return withFileLock(() => writeHistoryUnsafe(store));
}

export async function appendHistoryEntry(
  entry: HistoryEntry,
): Promise<void> {
  await withFileLock(async () => {
    const store = await readHistoryUnsafe();

    const existingIndex = store.entries.findIndex(
      (e) => e.threadId === entry.threadId,
    );

    if (existingIndex >= 0) {
      const existing = store.entries[existingIndex]!;
      store.entries[existingIndex] = {
        ...existing,
        lastActive: entry.lastActive,
        messageCount: entry.messageCount,
        feedbackCount: entry.feedbackCount,
        topics:
          entry.topics.length > 0 ? entry.topics : existing.topics,
        messages: existing.messages ?? entry.messages ?? [],
        lastQuery: entry.lastQuery ?? existing.lastQuery ?? "",
        lastResult: entry.lastResult ?? existing.lastResult ?? "",
      };
    } else {
      store.entries.unshift({
        ...entry,
        messages: entry.messages ?? [],
        lastQuery: entry.lastQuery ?? "",
        lastResult: entry.lastResult ?? "",
      });
    }

    store.updatedAt = new Date().toISOString();
    await writeHistoryUnsafe(store);
  });
}

export async function getHistoryEntries(
  _userId: string,
  limit = 50,
): Promise<HistoryEntry[]> {
  // ponytail: graph is global — history is shared across all users
  const store = await readHistory();
  return store.entries.slice(0, limit);
}

export async function appendMessages(
  threadId: string,
  newMessages: StoredMessage[],
  userId = "global",
): Promise<void> {
  await withFileLock(async () => {
    const store = await readHistoryUnsafe();
    let entry = store.entries.find((e) => e.threadId === threadId);

    /* Upsert: create a minimal entry if appendHistoryEntry hasn't run yet. */
    if (!entry) {
      entry = {
        threadId,
        userId,
        firstMessage: "",
        topics: [],
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        messageCount: 0,
        feedbackCount: 0,
        messages: [],
      };
      store.entries.unshift(entry);
    }

    const existing = entry.messages ?? [];
    entry.messages = [...existing, ...newMessages].slice(-MAX_MESSAGES_PER_THREAD);
    entry.messageCount = entry.messages.length;

    const lastUser = [...newMessages].reverse().find((m) => m.role === "user");
    const lastAssistant = [...newMessages].reverse().find((m) => m.role === "assistant");
    if (lastUser) {
      entry.lastQuery = lastUser.content;
      if (!entry.firstMessage) entry.firstMessage = lastUser.content;
    }
    if (lastAssistant) {
      entry.lastResult = lastAssistant.content;
    }
    entry.lastActive = new Date().toISOString();

    store.updatedAt = new Date().toISOString();
    await writeHistoryUnsafe(store);
  });
}

export async function getThreadMessages(
  threadId: string,
): Promise<StoredMessage[]> {
  const store = await readHistory();
  const entry = store.entries.find((e) => e.threadId === threadId);
  return entry?.messages ?? [];
}
