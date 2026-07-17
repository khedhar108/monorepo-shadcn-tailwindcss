"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";
import {
  Brain,
  ChevronDown,
  Sparkles,
  User,
  Wrench,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "../ai-elements/conversation";
import {
  Message,
  MessageContent,
} from "../ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "../ai-elements/prompt-input";
import { Suggestion, Suggestions } from "../ai-elements/suggestion";
import { useChatThread } from "../../hooks/use-chat-thread";
import { FeedbackBar, type FeedbackPayload, type FeedbackResult } from "../chat/FeedbackBar";
import { AssistantMessageParts } from "../chat/assistant-message-parts";
import { formatRelativeTime } from "../../lib/format-relative-time";
import { useLlmSelection } from "./llm-selection-context";

export type AgentChatProps = {
  apiUrl?: string;
  agentId: string;
  title?: string;
  description?: string;
  placeholder?: string;
  examplePrompts?: string[];
  className?: string;
  userId?: string;
  /**
   * Controlled thread id. When provided, the parent owns thread switching and
   * the chat remounts (via `key`) whenever this value changes — no page reload.
   * When omitted, the component manages its own thread id via sessionStorage.
   */
  threadId?: string | null;
  onFeedbackSubmitted?: (payload: FeedbackPayload) => void;
  onMessagesPersisted?: () => void;
  /** Dev-only footer with thread/agent ids. Hidden by default. */
  showSessionFooter?: boolean;
};

type StoredMessageData = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

function storedMessageToUIMessage(msg: StoredMessageData): UIMessage {
  const text = msg.content?.trim() ?? "";
  return {
    id: msg.id,
    role: msg.role,
    parts: text ? [{ type: "text" as const, text }] : [],
    createdAt: msg.createdAt ? new Date(msg.createdAt) : undefined,
    content: msg.content,
  } as UIMessage;
}

// ponytail: thin user-text extractor for non-assistant messages (no accordion).
function getUserMessageText(message: UIMessage): string {
  const fromParts = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
  if (fromParts.trim()) return fromParts;
  const legacy = (message as { content?: string }).content;
  return typeof legacy === "string" ? legacy : "";
}

// 40px avatar — circular monogram/icon, soft inset highlight, quiet shadow.
// Top offset clears the role+timestamp row so the chip lines up with the bubble.
function AvatarChip({ role }: { role: UIMessage["role"] }) {
  const isUser = role === "user";

  return (
    <div
      aria-hidden
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center self-start",
        "mt-[1.375rem]",
        "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:scale-[1.04] active:scale-[0.98]",
      )}
    >
      <div
        className="relative flex size-full items-center justify-center rounded-full text-white"
        style={{
          background: isUser
            ? "linear-gradient(145deg, #FB7185 0%, #E11D48 55%, #9F1239 100%)"
            : "linear-gradient(145deg, #5EEAD4 0%, #14B8A6 48%, #0F766E 100%)",
          boxShadow: isUser
            ? "0 2px 8px rgba(190,18,60,0.22), inset 0 1px 0 rgba(255,255,255,0.35)"
            : "0 2px 8px rgba(13,148,136,0.28), inset 0 1px 0 rgba(255,255,255,0.35)",
        }}
      >
        <span
          className="pointer-events-none absolute inset-x-[5px] top-[3px] h-2 rounded-full opacity-50"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.65) 0%, transparent 100%)",
          }}
        />
        {isUser ? (
          <User className="relative size-3.5" strokeWidth={2} />
        ) : (
          <span
            className="relative select-none text-[13px] font-semibold leading-none tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            A
          </span>
        )}
      </div>
    </div>
  );
}

function MessageTimestamp({ message }: { message: UIMessage }) {
  const created = (message as { createdAt?: Date | string }).createdAt;
  if (!created) return null;
  const label = formatRelativeTime(created);
  return (
    <span className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
      {label}
    </span>
  );
}

type AgentChatInnerProps = AgentChatProps & {
  threadId: string;
};

function AgentChatInner({
  apiUrl = "/api/chat",
  agentId,
  title = "Aria Assistant",
  description = "Streaming chat powered by your Mastra agent.",
  placeholder = "Ask anything...",
  examplePrompts = [],
  className,
  threadId,
  userId,
  onFeedbackSubmitted,
  onMessagesPersisted,
  showSessionFooter = false,
}: AgentChatInnerProps) {
  const { selection } = useLlmSelection();
  const memoryResource = userId ?? agentId;

  const [historyMessages, setHistoryMessages] = useState<UIMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const persistedMessageIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedHistoryRef = useRef(false);

  // Fetch past messages for this thread on mount
  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const response = await fetch(
          `/api/chat/history?threadId=${encodeURIComponent(threadId)}`,
        );
        if (response.ok) {
          const data = (await response.json()) as { messages?: StoredMessageData[] };
          const msgs = data.messages ?? [];
          if (!cancelled && msgs.length > 0) {
            const uiMessages = msgs
              .filter(
                (m) =>
                  m.role !== "assistant" ||
                  (m.content?.trim()?.length ?? 0) > 0,
              )
              .map(storedMessageToUIMessage);
            setHistoryMessages(uiMessages);
            uiMessages.forEach((m) => persistedMessageIdsRef.current.add(m.id));
          }
        }
      } catch {
        // Graceful fallback — start with empty messages
      } finally {
        if (!cancelled) {
          hasLoadedHistoryRef.current = true;
          setIsLoadingHistory(false);
        }
      }
    }
    void loadHistory();
    return () => { cancelled = true; };
  }, [threadId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiUrl,
        prepareSendMessagesRequest({ messages }) {
          const lastMessage = messages.at(-1);
          return {
            body: {
              agentId,
              messages: lastMessage ? [lastMessage] : messages,
              lastUserMessageId: lastMessage?.id,
              memory: {
                thread: threadId,
                resource: memoryResource,
              },
              requestContext: {
                ...(selection
                  ? {
                      llmModel: selection.model,
                      llmProvider: selection.provider,
                    }
                  : {}),
                userId: memoryResource,
                threadId,
              },
            },
          };
        },
      }),
    [agentId, apiUrl, memoryResource, threadId, selection],
  );

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
  });

  // Set initial messages from history once loaded
  useEffect(() => {
    if (hasLoadedHistoryRef.current && historyMessages.length > 0 && messages.length === 0) {
      setMessages(historyMessages);
    }
  }, [historyMessages, messages.length, setMessages]);

  const isBusy = status === "submitted" || status === "streaming";
  const lastMessage = messages.at(-1);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    const wasBusy =
      prevStatusRef.current === "submitted" ||
      prevStatusRef.current === "streaming";
    if (wasBusy && status === "ready") {
      onMessagesPersisted?.();
    }
    prevStatusRef.current = status;
  }, [status, onMessagesPersisted]);

  const submitFeedback = useCallback(
    async (payload: FeedbackPayload): Promise<FeedbackResult> => {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          userId: memoryResource,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "Failed to save feedback");
      }

      const result = (await response.json().catch(() => null)) as
        | {
            preferenceLabel?: string | null;
            graphUpdated?: boolean;
            nodesUpdated?: number;
          }
        | null;

      onFeedbackSubmitted?.(payload);

      return {
        preferenceLabel: result?.preferenceLabel ?? null,
        graphUpdated: result?.graphUpdated ?? false,
        nodesUpdated: result?.nodesUpdated ?? 0,
      };
    },
    [memoryResource, onFeedbackSubmitted],
  );

  return (
    <Card
      className={cn(
        "flex h-[min(720px,calc(100vh-12rem))] flex-col overflow-hidden border border-neutral-200/80 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900/90",
        className,
      )}
    >
      <CardHeader className="border-b border-neutral-100 pb-4 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-neutral-900 p-2.5 text-white dark:bg-neutral-100 dark:text-neutral-950">
            <Sparkles className="size-5" />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-4">
        <Conversation className="min-h-0 flex-1 overflow-x-hidden rounded-xl border border-neutral-200/70 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-950/40">
          <ConversationContent>
            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Loading conversation…
                </div>
              </div>
            ) : messages.length === 0 ? (
              <ConversationEmptyState
                title="Start a conversation with ARIA"
                description="Ask anything — ARIA adapts with semantic recall and feedback-shaped behavior."
                icon={<Sparkles className="size-8 text-neutral-300 dark:text-neutral-700" />}
              >
                {examplePrompts.length > 0 ? (
                  <Suggestions className="mt-4 max-w-lg justify-center">
                    {examplePrompts.map((example) => (
                      <Suggestion
                        key={example}
                        suggestion={example}
                        disabled={isBusy}
                        onClick={(value) => {
                          if (isBusy) {
                            return;
                          }
                          sendMessage({ text: value });
                        }}
                      />
                    ))}
                  </Suggestions>
                ) : null}
              </ConversationEmptyState>
            ) : (
              messages.map((message) => {
                const isAssistant = message.role === "assistant";
                const isStreamingThisMessage =
                  isBusy && isAssistant && message.id === lastMessage?.id;

                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex w-full min-w-0 items-start gap-2.5",
                      isAssistant ? "justify-start" : "justify-end",
                    )}
                  >
                    {isAssistant ? <AvatarChip role={message.role} /> : null}
                    <div
                      className={cn(
                        "flex min-w-0 flex-col gap-1",
                        isAssistant
                          ? "max-w-[85%] items-start"
                          : "max-w-[80%] items-end",
                      )}
                    >
                      <div className="flex items-center gap-1.5 px-1">
                        <span
                          className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {isAssistant ? "ARIA" : "You"}
                        </span>
                        <MessageTimestamp message={message} />
                      </div>
                      <Message from={message.role}>
                        <MessageContent>
                          {isAssistant ? (
                            <AssistantMessageParts
                              message={message}
                              isStreaming={isStreamingThisMessage}
                            />
                          ) : (
                            <span className="whitespace-pre-wrap break-words leading-relaxed">
                              {getUserMessageText(message).trim() || "\u200b"}
                            </span>
                          )}
                        </MessageContent>
                      </Message>
                      {/* ponytail: FeedbackBar is a sibling of MessageContent, not a
                          child — MessageContent has overflow-hidden for markdown,
                          which clips the Submit button. Sibling renders in full. */}
                      {isAssistant && !isStreamingThisMessage ? (
                        <FeedbackBar
                          messageId={message.id}
                          threadId={threadId}
                          disabled={isBusy}
                          onSubmit={submitFeedback}
                        />
                      ) : null}
                    </div>
                    {!isAssistant ? <AvatarChip role={message.role} /> : null}
                  </div>
                );
              })
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            {error.message}
          </p>
        ) : null}

        <PromptInput
          className="rounded-2xl border border-neutral-200/80 bg-white shadow-sm transition-all focus-within:border-neutral-300 focus-within:shadow-md focus-within:ring-2 focus-within:ring-neutral-900/5 dark:border-neutral-800 dark:bg-neutral-950 dark:focus-within:border-neutral-700 dark:focus-within:ring-white/5"
          onSubmit={({ text }) => {
            const trimmed = text.trim();
            if (!trimmed || isBusy) {
              return;
            }

            sendMessage({ text: trimmed });
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder={placeholder}
              className="min-h-[60px] resize-none text-[15px] leading-relaxed"
            />
          </PromptInputBody>
          <PromptInputFooter className="px-3 pb-2 pt-1">
            <PromptInputTools>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Zap className="size-3.5" />
                    {selection?.displayName ?? "Select model"}
                    <ChevronDown className="size-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-48">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Active model
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-xs" disabled>
                    <Brain className="size-3.5" />
                    {selection?.displayName ?? "None selected"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Tools registered
                  </DropdownMenuLabel>
                  <DropdownMenuItem className="text-xs" disabled>
                    <Wrench className="size-3.5" />
                    Topic extraction
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" disabled>
                    <Wrench className="size-3.5" />
                    Knowledge graph
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" disabled>
                    <Wrench className="size-3.5" />
                    Feedback recorder
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" disabled>
                    <Wrench className="size-3.5" />
                    Thread history
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </PromptInputTools>
            <PromptInputSubmit status={status} disabled={isBusy} />
          </PromptInputFooter>
        </PromptInput>
      </CardContent>

      {showSessionFooter ? (
        <CardFooter className="border-t border-neutral-100 pt-4 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          Memory thread <code className="mx-1">{threadId.slice(0, 8)}</code> · agent{" "}
          <code className="mx-1">{agentId}</code> · graph{" "}
          <code className="mx-1">{memoryResource}</code>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function AgentChat(props: AgentChatProps) {
  const threadId = useChatThread(undefined, props.threadId);

  if (!threadId) {
    return (
      <Card
        className={cn(
          "flex h-[min(720px,calc(100vh-12rem))] flex-col overflow-hidden border border-neutral-200/80 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900/90",
          props.className,
        )}
      >
        <CardHeader className="border-b border-neutral-100 pb-4 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-neutral-900 p-2.5 text-white dark:bg-neutral-100 dark:text-neutral-950">
              <Sparkles className="size-5" />
            </div>
            <div>
              <CardTitle>{props.title ?? "Aria Assistant"}</CardTitle>
              <CardDescription>
                {props.description ?? "Streaming chat powered by your Mastra agent."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          Preparing chat session…
        </CardContent>
      </Card>
    );
  }

  return <AgentChatInner key={threadId} {...props} threadId={threadId} />;
}
