// Spaced-repetition scheduler (PLAN.md §5.2, SM-2-lite).
// PR1 ships interfaces + default parameters only; logic + tests land in PR3.

export interface ReviewState {
  intervalDays: number
  ease: number
  lastReviewedAt: string | null
  nextReviewAt: string | null
}

export interface ReviewUpdateInput {
  current: ReviewState
  correct: boolean
  now?: Date
}

/** Compute the next interval/ease/review date after an attempt. */
export type UpdateSchedule = (input: ReviewUpdateInput) => ReviewState

/** Concept ids whose next review is due (next_review_at <= now). */
export type DueConcepts = (
  states: Array<{ conceptId: string; nextReviewAt: string | null }>,
  now?: Date,
) => string[]

export const SCHEDULER_DEFAULTS = {
  // Consecutive-correct interval ladder (days): 1 -> 3 -> 7 -> 16.
  intervalSequenceDays: [1, 3, 7, 16],
  // A wrong answer resets the interval back to 1 day.
  resetIntervalDays: 1,
  defaultEase: 2.5,
  minEase: 1.3,
  easePenalty: 0.2,
} as const
