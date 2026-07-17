"use client";

import { AgentChat } from "@repo/ai-ui/components/llm/agent-chat";
import {
  LlmSelectionProvider,
  useLlmSelection,
} from "@repo/ai-ui/components/llm/llm-selection-context";
import { ModelPickerTrigger } from "@repo/ai-ui/components/llm/model-picker-trigger";
import { KnowledgeGraph } from "@repo/ai-ui/components/graph/KnowledgeGraph";
import { ChatHistory } from "@repo/ai-ui/components/history/ChatHistory";
import type { ProviderGroup } from "@repo/ai-ui/lib/types";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";
import {
  Maximize2,
  Menu,
  Minimize2,
  RefreshCcw,
  Sparkles,
  Stars,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAvailableProviders } from "./llm/actions";
import { ARIA_AGENT_ID, GLOBAL_GRAPH_USER } from "../lib/agent-constants";

/* ── Constants ── */

const GRAPH_USER_ID = GLOBAL_GRAPH_USER;

function createThreadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const EXAMPLE_PROMPTS = [
  "Help me plan the ARIA knowledge graph experience",
  "Explain how feedback should change your future answers",
  "What patterns have I been exploring recently?",
] as const;

/* ── Hooks ── */

function useGraphVersion() {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((c) => c + 1), []);
  return { version, refresh } as const;
}

function useHistoryVersion() {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((c) => c + 1), []);
  return { version, refresh } as const;
}

/* ── Home Content ── */

function HomeContent() {
  const [providers, setProviders] = useState<ProviderGroup[]>([]);
  const { setSelection } = useLlmSelection();
  const { version: graphVersion, refresh: refreshGraph } = useGraphVersion();
  const { version: historyVersion, refresh: refreshHistory } = useHistoryVersion();
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  /* Initialize thread id (restore or create new) on mount */
  useEffect(() => {
    const existing = sessionStorage.getItem("aria-chat-thread-id");
    if (existing) {
      setCurrentThreadId(existing);
    } else {
      const next = createThreadId();
      sessionStorage.setItem("aria-chat-thread-id", next);
      setCurrentThreadId(next);
    }
  }, []);

  /* Load providers once */
  useEffect(() => {
    void getAvailableProviders().then(
      ({ providers: nextProviders, activeProvider }) => {
        setProviders(nextProviders);

        if (nextProviders.length === 0) return;

        try {
          if (localStorage.getItem("aria-llm-selection")) return;
        } catch {
          // Storage unavailable in private browsing.
        }

        const active =
          nextProviders.find((p) => p.provider === activeProvider) ??
          nextProviders.find((p) => p.connected) ??
          nextProviders[0];

        const defaultModel =
          active?.models.find((m) => m.role === "agent") ?? active?.models[0];

        if (active && defaultModel) {
          setSelection({
            provider: active.provider,
            model: defaultModel.id,
            displayName: defaultModel.name,
          });
        }
      },
    );
  }, [setSelection]);

  const graphKey = useMemo(
    () => `${GRAPH_USER_ID}:${graphVersion}`,
    [graphVersion],
  );

  /* ── Handlers ── */

  const handleNewChat = useCallback(() => {
    const next = createThreadId();
    sessionStorage.setItem("aria-chat-thread-id", next);
    setCurrentThreadId(next);
  }, []);

  const handleSelectThread = useCallback((threadId: string) => {
    sessionStorage.setItem("aria-chat-thread-id", threadId);
    setCurrentThreadId(threadId);
  }, []);

  const toggleMobileHistory = useCallback(
    () => setMobileHistoryOpen((prev) => !prev),
    [],
  );
  const closeMobileHistory = useCallback(() => setMobileHistoryOpen(false), []);

  const toggleGraphExpanded = useCallback(
    () => setGraphExpanded((prev) => !prev),
    [],
  );

  /* ── Persist history entry on feedback ── */

  const handleFeedbackSubmitted = useCallback(() => {
    refreshGraph();
    refreshHistory();
  }, [refreshGraph, refreshHistory]);

  const handleMessagesPersisted = useCallback(() => {
    refreshGraph();
    refreshHistory();
  }, [refreshGraph, refreshHistory]);

  return (
    <main
      className="relative flex h-screen flex-col overflow-hidden aria-dot-grid"
      style={{ background: "var(--aria-surface, #FAFAF8)" }}
    >
      {/* ── Ambient Background Accents ── */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="aria-breathe absolute -top-32 right-20 h-80 w-80 rounded-full opacity-40"
          style={{
            background:
              "radial-gradient(circle, rgba(13,148,136,0.08), transparent 70%)",
          }}
        />
        <div
          className="aria-breathe absolute bottom-10 left-10 h-72 w-72 rounded-full opacity-40"
          style={{
            background:
              "radial-gradient(circle, rgba(5,150,105,0.06), transparent 70%)",
            animationDelay: "3s",
          }}
        />
      </div>

      {/* ── Header ── */}
      <header
        className="aria-fade-in-up flex shrink-0 items-center justify-between gap-4 px-4 py-3 lg:px-6"
        style={{
          borderBottom: "1px solid var(--aria-border-subtle, #F0EEED)",
          background: "rgba(255, 255, 255, 0.7)",
          backdropFilter: "blur(16px) saturate(1.2)",
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={toggleMobileHistory}
            aria-label={mobileHistoryOpen ? "Close history" : "Open history"}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl transition-all hover:scale-105 active:scale-95 lg:hidden"
            style={{
              border: "1px solid var(--aria-border, #E8E5E0)",
              background: "var(--aria-surface-raised, #FFFFFF)",
              color: "var(--aria-text-secondary, #6B6B6B)",
            }}
          >
            {mobileHistoryOpen ? (
              <X className="size-4" />
            ) : (
              <Menu className="size-4" />
            )}
          </button>

          {/* Logo */}
          <div
            className="relative grid size-9 shrink-0 place-items-center rounded-xl aria-glow-accent"
            style={{
              background: "var(--aria-accent-muted, #F0FDFA)",
              border: "1px solid var(--aria-accent-soft, #CCFBF1)",
              color: "var(--aria-accent, #0D9488)",
            }}
          >
            <Sparkles className="size-4" />
            <span
              className="absolute -right-0.5 -top-0.5 size-2 rounded-full aria-pulse-ring"
              style={{
                background: "var(--aria-emerald, #059669)",
                boxShadow: "0 0 0 0 rgba(5, 150, 105, 0.5)",
              }}
            />
          </div>

          {/* Title */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                style={{
                  background: "var(--aria-accent-muted, #F0FDFA)",
                  color: "var(--aria-accent, #0D9488)",
                  border: "1px solid var(--aria-accent-soft, #CCFBF1)",
                }}
              >
                ARIA
              </span>
              <span
                className="hidden text-[11px] sm:inline"
                style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
              >
                Adaptive · Semantic Memory · Feedback Loop
              </span>
            </div>
            <h1
              className="mt-0.5 text-[15px] font-semibold tracking-tight lg:text-base"
              style={{ color: "var(--aria-text-primary, #1A1A1A)" }}
            >
              Talk. Watch ARIA think.
            </h1>
          </div>
        </div>

        {/* Right: model picker */}
        <div className="flex shrink-0 items-center gap-3">
          <ModelPickerTrigger
            providers={providers}
            className="w-auto min-w-45"
          />
        </div>
      </header>

      {/* ── Workspace: 20-60-20 ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Left: History Sidebar (20%) ── */}
        <aside
          className={cn(
            "hidden shrink-0 flex-col overflow-hidden p-3 pr-0 lg:flex",
          )}
          style={{ width: "20%", minWidth: "220px", maxWidth: "300px" }}
        >
          <ChatHistory
            userId={GRAPH_USER_ID}
            currentThreadId={currentThreadId}
            onNewChat={handleNewChat}
            onSelectThread={handleSelectThread}
            refreshKey={historyVersion}
            className="aria-fade-in-up aria-stagger-1 h-full"
          />
        </aside>

        {/* ── Mobile history drawer ── */}
        {mobileHistoryOpen && (
          <>
            <div
              className="fixed inset-0 z-20 lg:hidden"
              style={{
                background: "rgba(250, 250, 248, 0.7)",
                backdropFilter: "blur(8px)",
              }}
              onClick={closeMobileHistory}
              role="presentation"
            />
            <aside className="fixed left-0 top-0 z-30 h-full w-72 p-4 lg:hidden">
              <div
                className="flex h-full flex-col overflow-hidden rounded-2xl shadow-xl"
                style={{
                  background: "var(--aria-surface-raised, #FFFFFF)",
                  border: "1px solid var(--aria-border, #E8E5E0)",
                }}
              >
                <div className="flex items-center justify-end p-3">
                  <button
                    type="button"
                    onClick={closeMobileHistory}
                    className="flex size-8 items-center justify-center rounded-full transition-colors"
                    style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 px-3 pb-3">
                  <ChatHistory
                    userId={GRAPH_USER_ID}
                    currentThreadId={currentThreadId}
                    refreshKey={historyVersion}
                    onNewChat={() => {
                      closeMobileHistory();
                      handleNewChat();
                    }}
                    onSelectThread={(threadId) => {
                      closeMobileHistory();
                      handleSelectThread(threadId);
                    }}
                    className="h-full"
                  />
                </div>
              </div>
            </aside>
          </>
        )}

        {/* ── Center: Chat (60%) ── */}
        <div className="aria-fade-in-up aria-stagger-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl"
            style={{
              background: "var(--aria-surface-raised, #FFFFFF)",
              border: "1px solid var(--aria-border, #E8E5E0)",
              boxShadow: "var(--aria-shadow-md)",
            }}
          >
            <AgentChat
              key={currentThreadId ?? "no-thread"}
              agentId={ARIA_AGENT_ID}
              userId={GRAPH_USER_ID}
              threadId={currentThreadId}
              title="ARIA"
              description="Adaptive chat with semantic recall, working memory, and feedback-shaped behavior."
              placeholder="Ask ARIA anything. Feedback below answers changes future behavior..."
              examplePrompts={[...EXAMPLE_PROMPTS]}
              onFeedbackSubmitted={handleFeedbackSubmitted}
              onMessagesPersisted={handleMessagesPersisted}
              className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none"
            />
          </div>
        </div>

        {/* ── Right: Knowledge Graph Compact (20%) ── */}
        <aside
          className={cn(
            "hidden shrink-0 flex-col overflow-hidden p-3 pl-0 lg:flex",
          )}
          style={{ width: "20%", minWidth: "220px", maxWidth: "320px" }}
        >
          <div
            className="aria-fade-in-up aria-stagger-3 flex h-full flex-col overflow-hidden rounded-2xl"
            style={{
              background: "var(--aria-surface-raised, #FFFFFF)",
              border: "1px solid var(--aria-border, #E8E5E0)",
              boxShadow: "var(--aria-shadow-sm)",
            }}
          >
            {/* Graph toolbar */}
            <div
              className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5"
              style={{
                borderBottom: "1px solid var(--aria-border-subtle, #F0EEED)",
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Stars
                    className="size-3.5"
                    style={{ color: "var(--aria-emerald, #059669)" }}
                  />
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--aria-emerald, #059669)" }}
                  >
                    Knowledge Graph
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleGraphExpanded}
                  className="group h-7 px-2 text-xs transition-all hover:scale-105 active:scale-95"
                  style={{
                    borderColor: "var(--aria-border, #E8E5E0)",
                    background: "var(--aria-surface-inset, #F4F3F0)",
                    color: "var(--aria-text-secondary, #6B6B6B)",
                  }}
                  aria-label="Expand graph"
                >
                  <Maximize2 className="size-3 transition-transform group-hover:scale-110" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={refreshGraph}
                  className="group h-7 px-2 text-xs transition-all hover:scale-105 active:scale-95"
                  style={{
                    borderColor: "var(--aria-border, #E8E5E0)",
                    background: "var(--aria-surface-inset, #F4F3F0)",
                    color: "var(--aria-text-secondary, #6B6B6B)",
                  }}
                >
                  <RefreshCcw className="size-3 transition-transform group-hover:rotate-180" />
                </Button>
              </div>
            </div>

            {/* Graph canvas */}
            <KnowledgeGraph
              key={graphKey}
              userId={GRAPH_USER_ID}
              className="min-h-0 flex-1 rounded-none"
              demoMode={demoMode}
              onDemoModeChange={setDemoMode}
            />

            {/* Feedback hint */}
            <div
              className="px-3 py-2.5"
              style={{
                borderTop: "1px solid var(--aria-border-subtle, #F0EEED)",
              }}
            >
              <div
                className="flex items-center gap-1.5 text-[10px] leading-4"
                style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
              >
                <Zap
                  className="size-3 shrink-0"
                  style={{ color: "var(--aria-amber, #D97706)" }}
                />
                <span>Rate answers to shape graph nodes.</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Graph Expanded Overlay ── */}
      {graphExpanded && (
        <div className="fixed inset-0 z-50 flex flex-col aria-graph-overlay">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{
              background: "rgba(250, 250, 248, 0.95)",
              backdropFilter: "blur(20px)",
            }}
          />

          {/* Content */}
          <div className="relative z-10 flex flex-1 flex-col p-4 lg:p-6">
            {/* Overlay toolbar */}
            <div
              className="mb-4 flex items-center justify-between rounded-2xl px-5 py-3"
              style={{
                background: "rgba(255, 255, 255, 0.95)",
                border: "1px solid var(--aria-border, #E8E5E0)",
                backdropFilter: "blur(16px)",
                boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
              }}
            >
              <div className="flex items-center gap-3">
                <Stars
                  className="size-4"
                  style={{ color: "var(--aria-emerald, #059669)" }}
                />
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--aria-emerald, #059669)" }}
                >
                  Living Knowledge Graph
                </p>
                <span
                  className="text-[11px]"
                  style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
                >
                  Size = frequency · Color = type · Lines = co-occurrence
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={refreshGraph}
                  className="group h-8 px-3 text-xs transition-all hover:scale-105 active:scale-95"
                  style={{
                    borderColor: "var(--aria-border, #E8E5E0)",
                    background: "var(--aria-surface-inset, #F4F3F0)",
                    color: "var(--aria-text-secondary, #6B6B6B)",
                  }}
                >
                  <RefreshCcw className="mr-1.5 size-3.5 transition-transform group-hover:rotate-180" />
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleGraphExpanded}
                  className="group h-8 px-3 text-xs transition-all hover:scale-105 active:scale-95"
                  style={{
                    borderColor: "var(--aria-border, #E8E5E0)",
                    background: "var(--aria-surface-inset, #F4F3F0)",
                    color: "var(--aria-text-secondary, #6B6B6B)",
                  }}
                  aria-label="Collapse graph"
                >
                  <Minimize2 className="mr-1.5 size-3.5 transition-transform group-hover:scale-110" />
                  Collapse
                </Button>
              </div>
            </div>

            {/* Full-size graph */}
            <div
              className="relative min-h-0 flex-1 overflow-hidden rounded-2xl"
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--aria-border, #E8E5E0)",
                boxShadow: "0 4px 24px rgba(0, 0, 0, 0.06)",
              }}
            >
              <KnowledgeGraph
                key={`${graphKey}:expanded`}
                userId={GRAPH_USER_ID}
                className="absolute inset-0 rounded-none"
                demoMode={demoMode}
                onDemoModeChange={setDemoMode}
              />
            </div>

            {/* Feedback hint overlay */}
            <div
              className="pointer-events-none absolute bottom-8 right-8 max-w-56 rounded-xl px-4 py-3 text-xs leading-5"
              style={{
                background: "rgba(255, 255, 255, 0.92)",
                border: "1px solid var(--aria-border, #E8E5E0)",
                color: "var(--aria-text-secondary, #6B6B6B)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
              }}
            >
              <div
                className="mb-1 flex items-center gap-1.5 font-semibold"
                style={{ color: "var(--aria-emerald, #059669)" }}
              >
                <Zap className="size-3.5" />
                Feedback loop is live
              </div>
              Rate an answer in chat — ARIA shifts graph nodes toward green,
              yellow, or red.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ── Page Export ── */

export default function Home() {
  return (
    <LlmSelectionProvider>
      <HomeContent />
    </LlmSelectionProvider>
  );
}
