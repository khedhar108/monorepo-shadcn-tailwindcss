"use client";

import {
  Clock,
  MessageSquare,
  Plus,
  RotateCcw,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export type ThreadInfo = {
  threadId: string;
  messageCount: number;
  feedbackCount: number;
  lastActive: string;
  topics: string[];
  lastQuery?: string;
  lastResult?: string;
};

export type ChatHistoryProps = {
  userId: string;
  currentThreadId: string | null;
  onNewChat: () => void;
  onSelectThread?: (threadId: string) => void;
  className?: string;
};

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

type HistoryFileEntry = {
  threadId: string;
  userId: string;
  firstMessage: string;
  topics: string[];
  createdAt: string;
  lastActive: string;
  messageCount: number;
  feedbackCount: number;
  lastQuery?: string;
  lastResult?: string;
};

function historyEntryToThread(entry: HistoryFileEntry): ThreadInfo {
  return {
    threadId: entry.threadId,
    messageCount: entry.messageCount,
    feedbackCount: entry.feedbackCount,
    lastActive: entry.lastActive,
    topics: entry.topics,
    lastQuery: entry.lastQuery ?? entry.firstMessage ?? "",
    lastResult: entry.lastResult ?? "",
  };
}

export function ChatHistory({
  userId,
  currentThreadId,
  onNewChat,
  onSelectThread,
  className = "",
}: ChatHistoryProps) {
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      /* Fetch from both Mastra threads API and history file, then merge */
      const [threadsResponse, historyResponse] = await Promise.allSettled([
        fetch(`/api/threads?userId=${encodeURIComponent(userId)}`),
        fetch(`/api/history?userId=${encodeURIComponent(userId)}`),
      ]);

      const mastraThreads: ThreadInfo[] =
        threadsResponse.status === "fulfilled" && threadsResponse.value.ok
          ? ((await threadsResponse.value.json()) as { threads?: ThreadInfo[] }).threads ?? []
          : [];

      const historyEntries: HistoryFileEntry[] =
        historyResponse.status === "fulfilled" && historyResponse.value.ok
          ? ((await historyResponse.value.json()) as { entries?: HistoryFileEntry[] }).entries ?? []
          : [];

      /* Build a map of threadId → query/result from history file */
      const historyMap = new Map<string, { lastQuery?: string; lastResult?: string; messageCount?: number; feedbackCount?: number }>();
      for (const entry of historyEntries) {
        historyMap.set(entry.threadId, {
          lastQuery: entry.lastQuery ?? entry.firstMessage ?? "",
          lastResult: entry.lastResult ?? "",
          messageCount: entry.messageCount,
          feedbackCount: entry.feedbackCount,
        });
      }

      /* Merge: prefer Mastra threads for the list, enrich with history file data */
      if (mastraThreads.length > 0) {
        const merged = mastraThreads.map((t) => {
          const histData = historyMap.get(t.threadId);
          return {
            ...t,
            lastQuery: t.lastQuery ?? histData?.lastQuery ?? t.topics[0] ?? "",
            lastResult: t.lastResult ?? histData?.lastResult ?? "",
          };
        });
        setThreads(merged);
        return;
      }

      /* Fallback: use history file entries only */
      if (historyEntries.length > 0) {
        setThreads(historyEntries.map(historyEntryToThread));
        return;
      }

      setThreads([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-2xl border bg-white/90 shadow-sm backdrop-blur-sm ${className}`}
      style={{
        borderColor: "var(--aria-border, #E8E5E0)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--aria-border-subtle, #F0EEED)" }}
      >
        <div className="flex items-center gap-2">
          <Clock className="size-3.5" style={{ color: "var(--aria-accent, #0D9488)" }} />
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.15em]"
            style={{ color: "var(--aria-text-secondary, #6B6B6B)" }}
          >
            History
          </span>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            background: "var(--aria-accent-muted, #F0FDFA)",
            color: "var(--aria-accent, #0D9488)",
            border: "1px solid var(--aria-accent-soft, #CCFBF1)",
          }}
        >
          <Plus className="size-3" />
          New
        </button>
      </div>

      {/* Refresh bar */}
      <div
        className="flex flex-col items-center justify-center px-4 py-2"
        style={{ borderBottom: "1px solid var(--aria-border-subtle, #F0EEED)" }}
      >
        <button
          type="button"
          onClick={() => void fetchThreads()}
          className="flex items-center gap-1.5 text-[10px] transition-colors"
          style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--aria-text-secondary, #6B6B6B)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--aria-text-tertiary, #9C9C9C)")
          }
        >
          <RotateCcw className="size-3" />
          Refresh
        </button>
      </div>

      {/* Thread list — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
            >
              <div
                className="size-3 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: "var(--aria-accent, #0D9488)", borderTopColor: "transparent" }}
              />
              Loading...
            </div>
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-red-500">
            {error}
          </div>
        ) : threads.length === 0 ? (
          <div className="aria-fade-in-up flex flex-col items-center px-4 py-12 text-center">
            <Sparkles className="mb-3 size-7" style={{ color: "var(--aria-border, #E8E5E0)" }} />
            <p
              className="text-sm font-medium"
              style={{ color: "var(--aria-text-secondary, #6B6B6B)" }}
            >
              No conversations yet
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
            >
              Start chatting to build your history
            </p>
          </div>
        ) : (
          <div className="space-y-1 px-2 py-2">
            {threads.map((thread) => {
              const isActive = thread.threadId === currentThreadId;
              const query = thread.lastQuery || thread.topics[0] || "New conversation";
              return (
                <button
                  key={thread.threadId}
                  type="button"
                  onClick={() => onSelectThread?.(thread.threadId)}
                  className="w-full rounded-xl px-3 py-2.5 text-left transition-all duration-200"
                  style={{
                    background: isActive
                      ? "var(--aria-accent-muted, #F0FDFA)"
                      : "transparent",
                    border: isActive
                      ? "1px solid var(--aria-accent-soft, #CCFBF1)"
                      : "1px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background =
                        "var(--aria-surface-inset, #F4F3F0)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                  title={query}
                >
                  <p
                    className="truncate text-[12px] font-semibold leading-snug"
                    style={{ color: "var(--aria-text-primary, #1A1A1A)" }}
                  >
                    {query}
                  </p>
                  <div
                    className="mt-1.5 flex items-center gap-3 text-[10px]"
                    style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
                  >
                    <span className="flex items-center gap-1">
                      <MessageSquare className="size-2.5" />
                      {thread.messageCount}
                    </span>
                    {thread.feedbackCount > 0 ? (
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="size-2.5" />
                        {thread.feedbackCount}
                      </span>
                    ) : null}
                    <span className="ml-auto">
                      {formatRelativeTime(thread.lastActive)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
