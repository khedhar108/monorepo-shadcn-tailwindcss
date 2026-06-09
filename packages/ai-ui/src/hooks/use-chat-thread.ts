"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "aria-chat-thread-id";

function createThreadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useChatThread(storageKey = STORAGE_KEY): string | null {
  const [threadId, setThreadId] = useState<string | null>(null);

  useEffect(() => {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) {
      setThreadId(existing);
      return;
    }

    const nextThreadId = createThreadId();
    sessionStorage.setItem(storageKey, nextThreadId);
    setThreadId(nextThreadId);
  }, [storageKey]);

  return threadId;
}
