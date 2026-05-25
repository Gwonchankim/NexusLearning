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

const DAY_MS = 24 * 60 * 60 * 1000

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** EWMA mastery update: m' = clamp(m + alpha*weight*((correct?1:0) - m), 0, 1). */
export const updateMastery: UpdateMastery = ({ current, correct, difficulty, now }) => {
  const { alpha, weights } = ADAPTIVE_DEFAULTS
  const target = correct ? 1 : 0
  const mastery = clamp(
    current.mastery + alpha * weights[difficulty] * (target - current.mastery),
    0,
    1,
  )
  return {
    mastery,
    attemptsCount: current.attemptsCount + 1,
    lastReviewedAt: (now ?? new Date()).toISOString(),
  }
}

/** Forgetting decay: effective = mastery * exp(-lambda * daysSince(lastReviewedAt)). */
export const effectiveMastery: EffectiveMastery = (state, now) => {
  if (!state.lastReviewedAt) return state.mastery
  const elapsedMs = (now ?? new Date()).getTime() - new Date(state.lastReviewedAt).getTime()
  const days = Math.max(0, elapsedMs / DAY_MS)
  return state.mastery * Math.exp(-ADAPTIVE_DEFAULTS.lambda * days)
}
