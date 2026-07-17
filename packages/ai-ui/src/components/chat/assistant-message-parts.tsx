"use client";

import {
  type DynamicToolUIPart,
  type ReasoningUIPart,
  type UIMessage,
} from "ai";
import { Brain, Circle, Wrench } from "lucide-react";
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
import { MessageResponse } from "../ai-elements/message";
import { Shimmer } from "../ai-elements/shimmer";
import { shouldHideAssistantText } from "../../lib/message-sanitizer";

export type ToolPartType = ToolPart;

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

const SKIP_PART_TYPES = new Set([
  "step-start",
  "step-finish",
  "source",
  "data",
  "file",
]);

export function AgentToolPart({ part }: { part: ToolPart }) {
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

// ponytail: group consecutive reasoning + tool parts into one ChainOfThought
// accordion (Manus/Kimi style). Display order: all step groups first, then all
// visible text groups — even if the stream order was preamble → tools → answer.
export function groupAssistantParts(
  parts: UIMessage["parts"],
): Array<
  | { kind: "text"; part: UIMessage["parts"][number]; index: number }
  | { kind: "steps"; parts: Array<{ part: UIMessage["parts"][number]; index: number }> }
> {
  const groups: ReturnType<typeof groupAssistantParts> = [];
  let currentSteps: Array<{ part: UIMessage["parts"][number]; index: number }> = [];

  parts.forEach((part, index) => {
    if (SKIP_PART_TYPES.has(part.type)) return;

    const isStep = part.type === "reasoning" || isToolPart(part);
    const isText = part.type === "text";

    if (isStep) {
      currentSteps.push({ part, index });
    } else if (isText) {
      const text = (part as { text?: string }).text ?? "";
      // ponytail: hide leaked tool JSON / preambles / fragments at render time
      if (!text.trim() || shouldHideAssistantText(text)) return;
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

export type AssistantMessagePartsProps = {
  message: UIMessage;
  isStreaming: boolean;
};

/**
 * Renders an assistant message with Manus/Kimi-style layout:
 * - All step groups (reasoning + tool calls) rendered FIRST as collapsed accordions
 * - All visible text groups rendered AFTER, as the final answer
 * - Hidden text (leaked tool JSON / preambles) never rendered
 * - Friendly fallback when nothing remains after filtering
 */
export function AssistantMessageParts({
  message,
  isStreaming,
}: AssistantMessagePartsProps) {
  const groups = groupAssistantParts(message.parts);

  // ponytail: steps-first ordering — even if stream order was preamble → tools → answer,
  // display the "Thought for N steps" accordion above the final answer text.
  const stepGroups = groups.filter((g): g is Extract<typeof g, { kind: "steps" }> => g.kind === "steps");
  const textGroups = groups.filter((g): g is Extract<typeof g, { kind: "text" }> => g.kind === "text");

  const rendered: React.ReactNode[] = [];

  for (const group of stepGroups) {
    rendered.push(
      <StepGroup
        key={`${message.id}-steps-${group.parts[0]?.index}`}
        steps={group.parts}
        isStreamingThisMessage={isStreaming}
        messageId={message.id}
      />,
    );
  }

  for (const group of textGroups) {
    const part = group.part as { type: "text"; text: string };
    if (!part.text?.trim()) continue;
    rendered.push(
      <MessageResponse key={`${message.id}-text-${group.index}`} isAnimating={isStreaming}>
        {part.text}
      </MessageResponse>,
    );
  }

  if (rendered.length > 0) {
    return <>{rendered}</>;
  }

  // ponytail: friendly fallback — only hidden text existed, or genuinely empty
  if (isStreaming) {
    return <MessageResponse isAnimating={isStreaming}>Thinking...</MessageResponse>;
  }
  return (
    <MessageResponse isAnimating={false}>
      ARIA tried to run a tool but didn’t finish the answer — try again or switch model.
    </MessageResponse>
  );
}
