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
import { cn } from "@repo/ui/lib/utils";
import { Sparkles } from "lucide-react";
import { useMemo } from "react";
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
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "../ai-elements/prompt-input";
import { Suggestion, Suggestions } from "../ai-elements/suggestion";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "../ai-elements/tool";
import { useChatThread } from "../../hooks/use-chat-thread";
import { useLlmSelection } from "./llm-selection-context";

export type AgentChatProps = {
  apiUrl?: string;
  agentId: string;
  title?: string;
  description?: string;
  placeholder?: string;
  examplePrompts?: string[];
  className?: string;
};

function isToolPart(part: UIMessage["parts"][number]): part is ToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function isDynamicToolPart(part: ToolPart): part is DynamicToolUIPart {
  return part.type === "dynamic-tool";
}

function AgentToolPart({ part }: { part: ToolPart }) {
  return (
    <Tool defaultOpen={part.state !== "output-available"}>
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

function MessageParts({
  isAssistant,
  isStreamingThisMessage,
  message,
}: {
  isAssistant: boolean;
  isStreamingThisMessage: boolean;
  message: UIMessage;
}) {
  const renderedParts = message.parts.flatMap((part, index) => {
    const key = `${message.id}-${index}`;

    if (part.type === "text") {
      if (!part.text) {
        return [];
      }

      return [
        isAssistant ? (
          <MessageResponse key={key} isAnimating={isStreamingThisMessage}>
            {part.text}
          </MessageResponse>
        ) : (
          <span key={key}>{part.text}</span>
        ),
      ];
    }

    if (part.type === "reasoning") {
      return [
        <Reasoning
          key={key}
          isStreaming={part.state === "streaming"}
        >
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>,
      ];
    }

    if (isToolPart(part)) {
      return [<AgentToolPart key={key} part={part} />];
    }

    return [];
  });

  if (renderedParts.length > 0) {
    return renderedParts;
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
}: AgentChatInnerProps) {
  const { selection } = useLlmSelection();

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
              memory: {
                thread: threadId,
                resource: agentId,
              },
              requestContext: selection
                ? {
                    llmModel: selection.model,
                    llmProvider: selection.provider,
                  }
                : undefined,
            },
          };
        },
      }),
    [agentId, apiUrl, threadId, selection],
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  const isBusy = status === "submitted" || status === "streaming";
  const lastMessage = messages.at(-1);

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
        <Conversation className="min-h-0 flex-1 rounded-xl border border-neutral-200/70 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-950/40">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="Start a conversation with the agent"
                description="Send a message or pick a suggestion below."
              >
                {examplePrompts.length > 0 ? (
                  <Suggestions className="mt-2 justify-center">
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
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      <MessageParts
                        isAssistant={isAssistant}
                        isStreamingThisMessage={isStreamingThisMessage}
                        message={message}
                      />
                    </MessageContent>
                  </Message>
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
          className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
          onSubmit={({ text }) => {
            const trimmed = text.trim();
            if (!trimmed || isBusy) {
              return;
            }

            sendMessage({ text: trimmed });
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder={placeholder} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputSubmit status={status} disabled={isBusy} />
          </PromptInputFooter>
        </PromptInput>
      </CardContent>

      <CardFooter className="border-t border-neutral-100 pt-4 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        Memory thread <code className="mx-1">{threadId.slice(0, 8)}</code> · agent{" "}
        <code className="mx-1">{agentId}</code>
      </CardFooter>
    </Card>
  );
}

export function AgentChat(props: AgentChatProps) {
  const threadId = useChatThread();

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

  return <AgentChatInner {...props} threadId={threadId} />;
}
