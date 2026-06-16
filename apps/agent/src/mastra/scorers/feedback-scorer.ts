export type FeedbackScoreInput = {
  thumbs?: 'up' | 'down';
  rating?: number;
  comment?: string;
};

/**
 * Computes a 0.0–1.0 reward signal from user feedback.
 * Used by the feedback API and graph score updates.
 */
export function computeFeedbackScore(input: FeedbackScoreInput): number {
  let score = 0.5;

  if (input.thumbs === 'up') {
    score = 0.85;
  } else if (input.thumbs === 'down') {
    score = 0.15;
  }

  if (input.rating !== undefined) {
    const normalizedRating = Math.min(Math.max(input.rating, 1), 5) / 5;
    score = (score + normalizedRating) / 2;
  }

  if (input.comment && input.comment.trim().length >= 12) {
    score = Math.min(score + 0.05, 1);
  }

  return Math.round(score * 1000) / 1000;
}
