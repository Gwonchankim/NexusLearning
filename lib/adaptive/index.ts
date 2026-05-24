// Adaptive mastery engine (PLAN.md §5.1).
// PR1 ships interfaces + default parameters only. EWMA update and forgetting
// decay are implemented (with unit tests) in PR3.

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface MasteryState {
  mastery: number
  attemptsCount: number
  lastReviewedAt: string | null
}

export interface MasteryUpdateInput {
  current: MasteryState
  correct: boolean
  difficulty: Difficulty
  now?: Date
}

/** EWMA mastery update applied after a single attempt. */
export type UpdateMastery = (input: MasteryUpdateInput) => MasteryState

/** Mastery after applying forgetting decay since `lastReviewedAt`. */
export type EffectiveMastery = (state: MasteryState, now?: Date) => number

export const ADAPTIVE_DEFAULTS = {
  alpha: 0.3,
  weights: { easy: 0.8, medium: 1.0, hard: 1.3 } satisfies Record<Difficulty, number>,
  masteryThreshold: 0.7,
  lambda: 0.035,
} as const
