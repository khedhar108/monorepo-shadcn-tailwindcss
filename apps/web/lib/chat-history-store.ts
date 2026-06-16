import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const HISTORY_FILE = join(DATA_DIR, "chat-history.json");
const MAX_MESSAGES_PER_THREAD = 50;

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

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

export async function readHistory(): Promise<HistoryStore> {
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

export async function writeHistory(store: HistoryStore): Promise<void> {
  await ensureDataDir();
  await writeFile(HISTORY_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export async function appendHistoryEntry(
  entry: HistoryEntry,
): Promise<void> {
  const store = await readHistory();

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
    };
  } else {
    store.entries.unshift({
      ...entry,
      messages: entry.messages ?? [],
    });
  }

  store.updatedAt = new Date().toISOString();
  await writeHistory(store);
}

export async function getHistoryEntries(
  userId: string,
  limit = 50,
): Promise<HistoryEntry[]> {
  const store = await readHistory();
  return store.entries
    .filter((e) => e.userId === userId)
    .slice(0, limit);
}

export async function appendMessages(
  threadId: string,
  newMessages: StoredMessage[],
): Promise<void> {
  const store = await readHistory();
  const entry = store.entries.find((e) => e.threadId === threadId);

  if (entry) {
    const existing = entry.messages ?? [];
    entry.messages = [...existing, ...newMessages].slice(-MAX_MESSAGES_PER_THREAD);
    entry.messageCount = entry.messages.length;
  }

  store.updatedAt = new Date().toISOString();
  await writeHistory(store);
}

export async function getThreadMessages(
  threadId: string,
): Promise<StoredMessage[]> {
  const store = await readHistory();
  const entry = store.entries.find((e) => e.threadId === threadId);
  return entry?.messages ?? [];
}
