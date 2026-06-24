"use client";

import { Badge } from "@repo/ui/components/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import { cn } from "@repo/ui/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "group/tool not-prose mb-1.5 w-full min-w-0 max-w-full overflow-hidden rounded-lg border bg-white/60 backdrop-blur-sm",
      className
    )}
    style={{
      borderColor: "var(--aria-border-subtle, #F0EEED)",
    }}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "Awaiting",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Done",
  "output-denied": "Denied",
  "output-error": "Error",
};

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-3" style={{ color: "var(--aria-amber, #D97706)" }} />,
  "approval-responded": <CheckCircleIcon className="size-3" style={{ color: "var(--aria-accent, #0D9488)" }} />,
  "input-available": <ClockIcon className="size-3 animate-pulse" style={{ color: "var(--aria-amber, #D97706)" }} />,
  "input-streaming": <CircleIcon className="size-3" style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }} />,
  "output-available": <CheckCircleIcon className="size-3" style={{ color: "var(--aria-emerald, #059669)" }} />,
  "output-denied": <XCircleIcon className="size-3" style={{ color: "var(--aria-amber, #D97706)" }} />,
  "output-error": <XCircleIcon className="size-3 text-red-500" />,
};

const statusDotColor: Record<ToolPart["state"], string> = {
  "approval-requested": "bg-amber-500",
  "approval-responded": "bg-teal-500",
  "input-available": "bg-amber-500",
  "input-streaming": "animate-pulse bg-neutral-400",
  "output-available": "bg-emerald-500",
  "output-denied": "bg-amber-500",
  "output-error": "bg-red-500",
};

export const getStatusBadge = (status: ToolPart["state"]) => (
  <Badge className="gap-1 rounded-full text-xs" variant="secondary">
    {statusIcons[status]}
    {statusLabels[status]}
  </Badge>
);

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

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
  const label = title ?? prettifyToolName(derivedName);

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-sm transition-colors",
        className
      )}
      style={{
        color: "var(--aria-text-primary, #1A1A1A)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--aria-surface-inset, #F4F3F0)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            statusDotColor[state]
          )}
        />
        <WrenchIcon
          className="size-3.5 shrink-0"
          style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
        />
        <span className="truncate text-[12px] font-medium leading-tight">{label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {statusIcons[state]}
        <ChevronDownIcon
          className="size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/tool:rotate-180"
          style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
        />
      </div>
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 max-h-[280px] space-y-1.5 overflow-y-auto overflow-x-auto px-3 pb-2.5 pt-0 text-xs outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      "[&_pre]:whitespace-pre [&_pre]:break-normal [&_pre]:overflow-x-auto",
      className
    )}
    style={{
      color: "var(--aria-text-secondary, #6B6B6B)",
    }}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  if (input === undefined || input === null) {
    return null;
  }

  return (
    <div className={cn("min-w-0 space-y-1 overflow-hidden", className)} {...props}>
      <h4
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
      >
        Parameters
      </h4>
      <pre
        className="max-h-32 overflow-y-auto overflow-x-auto rounded-md border p-2 text-[11px] leading-relaxed whitespace-pre"
        style={{
          borderColor: "var(--aria-border-subtle, #F0EEED)",
          background: "var(--aria-surface-inset, #F4F3F0)",
        }}
      >
        {JSON.stringify(input, null, 2)}
      </pre>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  const isError = Boolean(errorText);
  const text =
    errorText ??
    (typeof output === "string"
      ? output
      : typeof output === "object"
        ? JSON.stringify(output, null, 2)
        : String(output ?? ""));

  return (
    <div className={cn("min-w-0 space-y-1", className)} {...props}>
      <h4
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--aria-text-tertiary, #9C9C9C)" }}
      >
        {isError ? "Error" : "Result"}
      </h4>
      <pre
        className={cn(
          "max-h-40 overflow-y-auto overflow-x-auto rounded-md border p-2 text-[11px] leading-relaxed whitespace-pre",
        )}
        style={{
          borderColor: isError
            ? "rgba(239,68,68,0.25)"
            : "var(--aria-border-subtle, #F0EEED)",
          background: isError
            ? "rgba(239,68,68,0.04)"
            : "var(--aria-surface-inset, #F4F3F0)",
          color: isError
            ? "#b91c1c"
            : "var(--aria-text-secondary, #6B6B6B)",
        }}
      >
        {text}
      </pre>
    </div>
  );
};

