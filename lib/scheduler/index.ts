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

const DAY_MS = 24 * 60 * 60 * 1000

/** Next interval on a correct answer: advance one rung on the ladder (capped). */
function nextLadderInterval(current: number): number {
  const ladder: readonly number[] = SCHEDULER_DEFAULTS.intervalSequenceDays
  const idx = ladder.indexOf(current)
  if (idx === -1) return ladder[0] // 0 / off-ladder / first correct -> 1 day
  return ladder[Math.min(idx + 1, ladder.length - 1)] // cap at last rung (16)
}

/**
 * SM-2-lite: correct advances the interval ladder (ease unchanged); wrong resets
 * the interval to 1 day and decrements ease (floored at minEase).
 */
export const updateSchedule: UpdateSchedule = ({ current, correct, now }) => {
  const at = now ?? new Date()
  let intervalDays: number
  let ease = current.ease
  if (correct) {
    intervalDays = nextLadderInterval(current.intervalDays)
  } else {
    intervalDays = SCHEDULER_DEFAULTS.resetIntervalDays
    ease = Math.max(SCHEDULER_DEFAULTS.minEase, current.ease - SCHEDULER_DEFAULTS.easePenalty)
  }
  return {
    intervalDays,
    ease,
    lastReviewedAt: at.toISOString(),
    nextReviewAt: new Date(at.getTime() + intervalDays * DAY_MS).toISOString(),
  }
}

/** Concept ids whose next review is due (nextReviewAt set and <= now). */
export const dueConcepts: DueConcepts = (states, now) => {
  const at = (now ?? new Date()).getTime()
  return states
    .filter((s) => s.nextReviewAt != null && new Date(s.nextReviewAt).getTime() <= at)
    .map((s) => s.conceptId)
}
