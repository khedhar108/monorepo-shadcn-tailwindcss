"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  type ReasoningUIPart,
  type UIMessage,
} from "ai";
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
  Circle,
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
  MessageResponse,
} from "../ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "../ai-elements/prompt-input";
import { Suggestion, Suggestions } from "../ai-elements/suggestion";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "../ai-elements/chain-of-thought";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "../ai-elements/tool";
import { Shimmer } from "../ai-elements/shimmer";
import { useChatThread } from "../../hooks/use-chat-thread";
import { FeedbackBar, type FeedbackPayload, type FeedbackResult } from "../chat/FeedbackBar";
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
};

type StoredMessageData = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

function storedMessageToUIMessage(msg: StoredMessageData): UIMessage {
  return {
    id: msg.id,
    role: msg.role,
    parts: [{ type: "text" as const, text: msg.content }],
    createdAt: msg.createdAt ? new Date(msg.createdAt) : undefined,
    content: msg.content,
  } as UIMessage;
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
}

function isToolPart(part: UIMessage["parts"][number]): part is ToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function isDynamicToolPart(part: ToolPart): part is DynamicToolUIPart {
  return part.type === "dynamic-tool";
}

const toolLabelMap: Record<string, string> = {
  topicExtractorTool: "Topic extraction",
  graphQueryTool: "Knowledge graph",
  listThreadsTool: "Thread history",
  getAvailableProvidersTool: "Model providers",
  feedbackRecorderTool: "Feedback",
  "topic-extractor": "Topic extraction",
  "graph-query": "Knowledge graph",
  "list-threads": "Thread history",
  "get-available-providers": "Model providers",
  "feedback-recorder": "Feedback",
};

function prettifyToolName(name: string): string {
  return toolLabelMap[name] ?? name;
}

function AgentToolPart({ part }: { part: ToolPart }) {
  return (
    <Tool defaultOpen={false}>
      {isDynamicToolPart(part) ? (
        <ToolHeader state={part.state} toolName={part.toolName} type={part.type} />
      ) : (
        <ToolHeader state={part.state} type={part.type} />
      )}
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput errorText={part.errorText} output={part.output} />
      </ToolContent>
    </Tool>
  );
}

// ponytail: group consecutive reasoning + tool parts into one ChainOfThought accordion (Manus/Kimi style)
function groupParts(
  parts: UIMessage["parts"],
): Array<
  | { kind: "text"; part: UIMessage["parts"][number]; index: number }
  | { kind: "steps"; parts: Array<{ part: UIMessage["parts"][number]; index: number }> }
> {
  const groups: Array<
    | { kind: "text"; part: UIMessage["parts"][number]; index: number }
    | { kind: "steps"; parts: Array<{ part: UIMessage["parts"][number]; index: number }> }
  > = [];

  let currentSteps: Array<{ part: UIMessage["parts"][number]; index: number }> = [];

  parts.forEach((part, index) => {
    const isStep = part.type === "reasoning" || isToolPart(part);
    const isText = part.type === "text";

    if (isStep) {
      currentSteps.push({ part, index });
    } else if (isText) {
      if (currentSteps.length > 0) {
        groups.push({ kind: "steps", parts: currentSteps });
        currentSteps = [];
      }
      groups.push({ kind: "text", part, index });
    } else {
      if (currentSteps.length > 0) {
        groups.push({ kind: "steps", parts: currentSteps });
        currentSteps = [];
      }
      groups.push({ kind: "text", part, index });
    }
  });

  if (currentSteps.length > 0) {
    groups.push({ kind: "steps", parts: currentSteps });
  }

  return groups;
}

function StepGroup({
  steps,
  isStreamingThisMessage,
  messageId,
}: {
  steps: Array<{ part: UIMessage["parts"][number]; index: number }>;
  isStreamingThisMessage: boolean;
  messageId: string;
}) {
  const hasActiveStep = steps.some(
    (s) =>
      (s.part.type === "reasoning" && (s.part as ReasoningUIPart).state === "streaming") ||
      (isToolPart(s.part) && (s.part as ToolPart).state === "input-available"),
  );

  const completedCount = steps.filter((s) => {
    if (s.part.type === "reasoning") {
      return (s.part as ReasoningUIPart).state !== "streaming";
    }
    if (isToolPart(s.part)) {
      return (s.part as ToolPart).state === "output-available";
    }
    return false;
  }).length;

  const headerLabel = isStreamingThisMessage
    ? hasActiveStep
      ? "Thinking…"
      : "Thought process"
    : `Thought for ${steps.length} step${steps.length > 1 ? "s" : ""}`;

  return (
    <ChainOfThought defaultOpen={isStreamingThisMessage}>
      <ChainOfThoughtHeader>
        {isStreamingThisMessage && hasActiveStep ? (
          <Shimmer className="text-xs font-medium">{headerLabel}</Shimmer>
        ) : (
          <span className="text-xs font-medium">{headerLabel}</span>
        )}
        {!isStreamingThisMessage && completedCount > 0 && (
          <span className="ml-1 text-muted-foreground/60">· {completedCount} done</span>
        )}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {steps.map(({ part, index }) => {
          const key = `${messageId}-step-${index}`;

          if (part.type === "reasoning") {
            const reasoningPart = part as ReasoningUIPart;
            const isActive = reasoningPart.state === "streaming";
            const text = reasoningPart.text || "";
            const preview = text.length > 80 ? text.slice(0, 80) + "…" : text || "Reasoning…";

            return (
              <ChainOfThoughtStep
                key={key}
                icon={Brain}
                label={
                  <span className="font-medium">
                    {isActive ? "Reasoning" : "Reasoned"}
                  </span>
                }
                description={preview}
                status={isActive ? "active" : "complete"}
              >
                {text && text.length > 80 && (
                  <div className="rounded-md border border-neutral-200/60 bg-neutral-50/50 p-2 text-xs leading-relaxed text-muted-foreground dark:border-neutral-800/60 dark:bg-neutral-950/40">
                    {text}
                  </div>
                )}
              </ChainOfThoughtStep>
            );
          }

          if (isToolPart(part)) {
            const toolPart = part as ToolPart;
            const isActive = toolPart.state === "input-available" || toolPart.state === "input-streaming";
            const isComplete = toolPart.state === "output-available";
            const toolName = isDynamicToolPart(toolPart)
              ? prettifyToolName(toolPart.toolName)
              : prettifyToolName(toolPart.type.split("-").slice(1).join("-"));

            return (
              <ChainOfThoughtStep
                key={key}
                icon={Wrench}
                label={
                  <span className="flex items-center gap-1.5 font-medium">
                    {toolName}
                    {isActive && (
                      <Circle className="size-2 animate-pulse text-amber-500" />
                    )}
                  </span>
                }
                description={
                  isActive
                    ? "Running…"
                    : isComplete
                      ? "Completed"
                      : toolPart.state === "output-error"
                        ? "Error"
                        : toolPart.state
                }
                status={isActive ? "active" : isComplete ? "complete" : "pending"}
              >
                <AgentToolPart part={toolPart} />
              </ChainOfThoughtStep>
            );
          }

          return null;
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function MessageParts({
  isAssistant,
  isStreamingThisMessage,
  message,
}: {
  isAssistant: boolean;
  isStreamingThisMessage: boolean;
  message: UIMessage;
}) {
  // ponytail: non-assistant messages get flat rendering (no accordion needed for user text)
  if (!isAssistant) {
    const textPart = message.parts.find((p) => p.type === "text") as { text?: string } | undefined;
    if (!textPart?.text) return [];
    return [
      <span key={`${message.id}-text`} className="whitespace-pre-wrap break-words leading-relaxed">
        {textPart.text}
      </span>,
    ];
  }

  // Assistant: group reasoning + tool parts into ChainOfThought accordions
  const groups = groupParts(message.parts);
  const rendered: React.ReactNode[] = [];

  for (const group of groups) {
    if (group.kind === "steps") {
      rendered.push(
        <StepGroup
          key={`${message.id}-steps-${group.parts[0]?.index}`}
          steps={group.parts}
          isStreamingThisMessage={isStreamingThisMessage}
          messageId={message.id}
        />,
      );
    } else if (group.kind === "text") {
      const part = group.part as { type: "text"; text: string };
      if (!part.text) {
        if (!isStreamingThisMessage) {
          rendered.push(
            <MessageResponse key={`${message.id}-text-${group.index}`} isAnimating={false}>
              {"*(no response recorded)*"}
            </MessageResponse>,
          );
        }
        continue;
      }
      rendered.push(
        <MessageResponse key={`${message.id}-text-${group.index}`} isAnimating={isStreamingThisMessage}>
          {part.text}
        </MessageResponse>,
      );
    }
  }

  if (rendered.length > 0) {
    return rendered;
  }

  return isStreamingThisMessage ? (
    <MessageResponse isAnimating={isStreamingThisMessage}>Thinking...</MessageResponse>
  ) : null;
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
            const uiMessages = msgs.map(storedMessageToUIMessage);
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

  async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResult> {
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
  }

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
                      "flex w-full min-w-0 gap-2.5",
                      isAssistant ? "justify-start" : "justify-end",
                    )}
                  >
                    {isAssistant && (
                      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white dark:bg-emerald-600">
                        <Sparkles className="size-3.5" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "flex min-w-0 flex-col gap-1",
                        isAssistant
                          ? "max-w-[85%] items-start"
                          : "max-w-[80%] items-end",
                      )}
                    >
                      <span className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        {isAssistant ? "ARIA" : "You"}
                      </span>
                      <Message from={message.role}>
                        <MessageContent>
                          <MessageParts
                            isAssistant={isAssistant}
                            isStreamingThisMessage={isStreamingThisMessage}
                            message={message}
                          />
                          {isAssistant && !isStreamingThisMessage ? (
                            <FeedbackBar
                              messageId={message.id}
                              threadId={threadId}
                              disabled={isBusy}
                              onSubmit={submitFeedback}
                            />
                          ) : null}
                        </MessageContent>
                      </Message>
                    </div>
                    {!isAssistant && (
                      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-400 text-white dark:bg-rose-600">
                        <User className="size-3.5" />
                      </div>
                    )}
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
          className="rounded-2xl border border-neutral-200/80 bg-white shadow-sm transition-all focus-within:border-neutral-300 focus-within:shadow-md dark:border-neutral-800 dark:bg-neutral-950 dark:focus-within:border-neutral-700"
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

      <CardFooter className="border-t border-neutral-100 pt-4 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        Memory thread <code className="mx-1">{threadId.slice(0, 8)}</code> · agent{" "}
        <code className="mx-1">{agentId}</code> · graph{" "}
        <code className="mx-1">{memoryResource}</code>
      </CardFooter>
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
