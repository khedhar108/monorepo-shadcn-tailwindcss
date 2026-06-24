type DerivePreferenceInput = {
  thumbs?: 'up' | 'down';
  rating?: number;
  comment?: string;
};

type DerivePreferenceResult = {
  label: string;
  confidence: number;
};

const POSITIVE_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bconcise\b/i, label: 'concise answers' },
  { pattern: /\bshort\b/i, label: 'concise answers' },
  { pattern: /\bbrief\b/i, label: 'concise answers' },
  { pattern: /\bdetailed\b/i, label: 'detailed answers' },
  { pattern: /\bthorough\b/i, label: 'detailed answers' },
  { pattern: /\bin depth\b/i, label: 'detailed answers' },
  { pattern: /\bcode examples?\b/i, label: 'code examples' },
  { pattern: /\bexamples?\b/i, label: 'examples in answers' },
  { pattern: /\bstep.?by.?step\b/i, label: 'step-by-step explanations' },
  { pattern: /\bclear\b/i, label: 'clear explanations' },
  { pattern: /\bhelpful\b/i, label: 'helpful answers' },
  { pattern: /\bfast\b/i, label: 'fast responses' },
  { pattern: /\bquick\b/i, label: 'fast responses' },
];

const NEGATIVE_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\btoo long\b/i, label: 'avoid verbosity' },
  { pattern: /\btoo verbose\b/i, label: 'avoid verbosity' },
  { pattern: /\bverbose\b/i, label: 'avoid verbosity' },
  { pattern: /\btoo short\b/i, label: 'avoid brevity' },
  { pattern: /\btoo brief\b/i, label: 'avoid brevity' },
  { pattern: /\btoo detailed\b/i, label: 'avoid over-detail' },
  { pattern: /\bconfusing\b/i, label: 'avoid confusion' },
  { pattern: /\bunclear\b/i, label: 'avoid unclear answers' },
  { pattern: /\bslow\b/i, label: 'avoid slow responses' },
  { pattern: /\btoo many examples?\b/i, label: 'avoid excessive examples' },
  { pattern: /\bnot helpful\b/i, label: 'avoid unhelpful answers' },
  { pattern: /\brambly\b/i, label: 'avoid rambling' },
  { pattern: /\bwaffle?\b/i, label: 'avoid rambling' },
];

export function derivePreferenceLabel(
  input: DerivePreferenceInput,
): DerivePreferenceResult | null {
  const comment = input.comment?.trim() ?? '';

  // 1) Try rule map on comment text
  if (comment.length > 0) {
    const isPositive =
      input.thumbs === 'up' ||
      (input.rating !== undefined && input.rating >= 4);

    const rules = isPositive ? POSITIVE_RULES : NEGATIVE_RULES;
    for (const rule of rules) {
      if (rule.pattern.test(comment)) {
        return { label: rule.label, confidence: 0.85 };
      }
    }

    // Also check both rule sets if we can't determine sentiment from thumbs/rating
    if (input.thumbs === undefined && input.rating === undefined) {
      for (const rule of POSITIVE_RULES) {
        if (rule.pattern.test(comment)) {
          return { label: rule.label, confidence: 0.7 };
        }
      }
      for (const rule of NEGATIVE_RULES) {
        if (rule.pattern.test(comment)) {
          return { label: rule.label, confidence: 0.7 };
        }
      }
    }
  }

  // 2) Rating-based fallback
  if (input.rating !== undefined && input.rating <= 2) {
    return {
      label: 'needs different approach',
      confidence: 0.6,
    };
  }
  if (input.rating !== undefined && input.rating >= 4) {
    return {
      label: 'reinforce current style',
      confidence: 0.6,
    };
  }

  // 3) Sentiment fallback from thumbs
  if (input.thumbs === 'up') {
    return { label: 'general sentiment: positive', confidence: 0.5 };
  }
  if (input.thumbs === 'down') {
    return { label: 'general sentiment: negative', confidence: 0.5 };
  }

  return null;
}
