"use client";

import { Check, MessageSquare, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@repo/ui/lib/utils";

export type FeedbackPayload = {
  messageId: string;
  threadId: string;
  thumbs?: "up" | "down";
  rating?: number;
  comment?: string;
};

export type FeedbackResult = {
  preferenceLabel?: string | null;
  graphUpdated?: boolean;
  nodesUpdated?: number;
};

export type FeedbackBarProps = {
  messageId: string;
  threadId: string;
  disabled?: boolean;
  onSubmit: (payload: FeedbackPayload) => Promise<FeedbackResult | void>;
};

export function FeedbackBar({
  messageId,
  threadId,
  disabled,
  onSubmit,
}: FeedbackBarProps) {
  const [thumbs, setThumbs] = useState<"up" | "down" | undefined>();
  const [rating, setRating] = useState<number | undefined>();
  const [comment, setComment] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [preferenceLabel, setPreferenceLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => Boolean(thumbs || rating || comment.trim()),
    [thumbs, rating, comment],
  );

  async function handleSubmit() {
    if (!canSubmit || disabled || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await onSubmit({
        messageId,
        threadId,
        thumbs,
        rating,
        comment: comment.trim() || undefined,
      });
      setPreferenceLabel(result?.preferenceLabel ?? null);
      setSubmitted(true);
      setExpanded(false);

      // Toast: graph modified alert
      if (result?.graphUpdated) {
        const nodesCount = result.nodesUpdated ?? 0;
        const prefPart = result.preferenceLabel
          ? ` · preference "${result.preferenceLabel}" added`
          : "";
        toast.success("Graph modified", {
          description: `${nodesCount} node(s) rescored${prefPart}`,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feedback failed");
      toast.error("Feedback failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <Check className="size-3.5" />
        {preferenceLabel
          ? `Saved preference: ${preferenceLabel}`
          : "Feedback saved. ARIA will adapt."}
      </div>
    );
  }

  return (
    <div className="mt-2 max-w-xl rounded-2xl border border-neutral-200/70 bg-white/70 p-2 shadow-sm backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-950/55">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Shape ARIA
        </span>
        <button
          type="button"
          disabled={disabled || isSubmitting}
          onClick={() => setThumbs(thumbs === "up" ? undefined : "up")}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
            thumbs === "up"
              ? "border-emerald-400 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-neutral-200 text-neutral-500 hover:border-emerald-300 hover:text-emerald-600 dark:border-neutral-800 dark:text-neutral-400",
          )}
        >
          <ThumbsUp className="size-3.5" />
          Useful
        </button>
        <button
          type="button"
          disabled={disabled || isSubmitting}
          onClick={() => setThumbs(thumbs === "down" ? undefined : "down")}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
            thumbs === "down"
              ? "border-rose-400 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : "border-neutral-200 text-neutral-500 hover:border-rose-300 hover:text-rose-600 dark:border-neutral-800 dark:text-neutral-400",
          )}
        >
          <ThumbsDown className="size-3.5" />
          Missed
        </button>
        <div className="flex items-center gap-0.5 rounded-full border border-neutral-200 px-2 py-1 dark:border-neutral-800">
          {Array.from({ length: 5 }, (_, index) => {
            const value = index + 1;
            return (
              <button
                key={value}
                type="button"
                disabled={disabled || isSubmitting}
                onClick={() => setRating(rating === value ? undefined : value)}
                className="text-amber-400 transition hover:scale-110 disabled:opacity-50"
                aria-label={`${value} star rating`}
              >
                <Star
                  className={cn(
                    "size-3.5",
                    rating && value <= rating ? "fill-current" : "fill-transparent",
                  )}
                />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={disabled || isSubmitting}
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-800 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <MessageSquare className="size-3.5" />
          Note
        </button>
        <button
          type="button"
          disabled={!canSubmit || disabled || isSubmitting}
          onClick={() => void handleSubmit()}
          className="ml-auto rounded-full bg-neutral-950 px-3 py-1 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white"
        >
          {isSubmitting ? "Saving..." : "Apply"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-2 flex items-end gap-2">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Tell ARIA what to change next time..."
            className="min-h-20 flex-1 resize-none rounded-xl border border-neutral-200 bg-white/80 px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950/80 dark:focus:border-neutral-600"
          />
          <button
            type="button"
            disabled={!canSubmit || disabled || isSubmitting}
            onClick={() => void handleSubmit()}
            className="mb-0.5 shrink-0 rounded-xl bg-neutral-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white"
          >
            {isSubmitting ? "Saving..." : "Submit"}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-rose-500">{error}</p> : null}
    </div>
  );
}
