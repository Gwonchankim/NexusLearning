import { describe, it, expect } from 'vitest'
import {
  updateMastery,
  effectiveMastery,
  ADAPTIVE_DEFAULTS,
  type MasteryState,
} from './index'

const base: MasteryState = { mastery: 0.5, attemptsCount: 2, lastReviewedAt: null }
const NOW = new Date('2026-05-25T00:00:00.000Z')

describe('updateMastery', () => {
  it('increases mastery on a correct answer', () => {
    const next = updateMastery({ current: base, correct: true, difficulty: 'medium', now: NOW })
    expect(next.mastery).toBeGreaterThan(base.mastery)
    expect(next.attemptsCount).toBe(3)
    expect(next.lastReviewedAt).toBe(NOW.toISOString())
  })
  it('decreases mastery on a wrong answer', () => {
    const next = updateMastery({ current: base, correct: false, difficulty: 'medium', now: NOW })
    expect(next.mastery).toBeLessThan(base.mastery)
  })
  it('moves more for harder difficulty (bigger weight)', () => {
    const easy = updateMastery({ current: base, correct: true, difficulty: 'easy', now: NOW }).mastery
    const hard = updateMastery({ current: base, correct: true, difficulty: 'hard', now: NOW }).mastery
    expect(hard - base.mastery).toBeGreaterThan(easy - base.mastery)
  })
  it('clamps within [0, 1]', () => {
    const hi = updateMastery({
      current: { mastery: 1, attemptsCount: 0, lastReviewedAt: null },
      correct: true,
      difficulty: 'hard',
      now: NOW,
    })
    expect(hi.mastery).toBeLessThanOrEqual(1)
    const lo = updateMastery({
      current: { mastery: 0, attemptsCount: 0, lastReviewedAt: null },
      correct: false,
      difficulty: 'hard',
      now: NOW,
    })
    expect(lo.mastery).toBeGreaterThanOrEqual(0)
  })
  it('matches the documented EWMA formula', () => {
    const { alpha, weights } = ADAPTIVE_DEFAULTS
    const expected = base.mastery + alpha * weights.medium * (1 - base.mastery)
    const next = updateMastery({ current: base, correct: true, difficulty: 'medium', now: NOW })
    expect(next.mastery).toBeCloseTo(expected, 10)
  })
})

describe('effectiveMastery', () => {
  it('returns raw mastery when never reviewed', () => {
    expect(effectiveMastery({ mastery: 0.6, attemptsCount: 0, lastReviewedAt: null }, NOW)).toBe(0.6)
  })
  it('equals mastery at zero elapsed days', () => {
    const state: MasteryState = { mastery: 0.8, attemptsCount: 1, lastReviewedAt: NOW.toISOString() }
    expect(effectiveMastery(state, NOW)).toBeCloseTo(0.8, 10)
  })
  it('decays toward 0 as days pass', () => {
    const state: MasteryState = { mastery: 0.8, attemptsCount: 1, lastReviewedAt: NOW.toISOString() }
    const in10 = effectiveMastery(state, new Date(NOW.getTime() + 10 * 86400000))
    const in30 = effectiveMastery(state, new Date(NOW.getTime() + 30 * 86400000))
    expect(in10).toBeLessThan(0.8)
    expect(in30).toBeLessThan(in10)
    expect(in30).toBeGreaterThan(0)
  })
  it('matches exp(-lambda*days)', () => {
    const state: MasteryState = { mastery: 1, attemptsCount: 1, lastReviewedAt: NOW.toISOString() }
    const days = 14
    const got = effectiveMastery(state, new Date(NOW.getTime() + days * 86400000))
    expect(got).toBeCloseTo(Math.exp(-ADAPTIVE_DEFAULTS.lambda * days), 10)
  })
})
