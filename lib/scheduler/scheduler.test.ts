import { describe, it, expect } from 'vitest'
import { updateSchedule, dueConcepts, SCHEDULER_DEFAULTS, type ReviewState } from './index'

const NOW = new Date('2026-05-25T00:00:00.000Z')
const fresh: ReviewState = {
  intervalDays: 0,
  ease: SCHEDULER_DEFAULTS.defaultEase,
  lastReviewedAt: null,
  nextReviewAt: null,
}

function daysBetween(aIso: string, b: Date): number {
  return Math.round((new Date(aIso).getTime() - b.getTime()) / 86400000)
}

describe('updateSchedule — correct path (ladder)', () => {
  it('first correct schedules 1 day out, ease unchanged', () => {
    const r = updateSchedule({ current: fresh, correct: true, now: NOW })
    expect(r.intervalDays).toBe(1)
    expect(r.ease).toBe(SCHEDULER_DEFAULTS.defaultEase)
    expect(daysBetween(r.nextReviewAt!, NOW)).toBe(1)
    expect(r.lastReviewedAt).toBe(NOW.toISOString())
  })
  it('advances 1 -> 3 -> 7 -> 16 then caps at 16', () => {
    const seq: number[] = []
    let state = fresh
    for (let i = 0; i < 5; i++) {
      state = updateSchedule({ current: state, correct: true, now: NOW })
      seq.push(state.intervalDays)
    }
    expect(seq).toEqual([1, 3, 7, 16, 16])
  })
})

describe('updateSchedule — wrong path (reset + ease penalty)', () => {
  it('resets interval to 1 and decrements ease', () => {
    const current: ReviewState = { intervalDays: 7, ease: 2.5, lastReviewedAt: null, nextReviewAt: null }
    const r = updateSchedule({ current, correct: false, now: NOW })
    expect(r.intervalDays).toBe(1)
    expect(r.ease).toBeCloseTo(2.3, 10)
    expect(daysBetween(r.nextReviewAt!, NOW)).toBe(1)
  })
  it('floors ease at minEase', () => {
    const current: ReviewState = { intervalDays: 3, ease: 1.4, lastReviewedAt: null, nextReviewAt: null }
    const r = updateSchedule({ current, correct: false, now: NOW })
    expect(r.ease).toBe(SCHEDULER_DEFAULTS.minEase)
  })
})

describe('dueConcepts', () => {
  it('returns only concepts whose nextReviewAt <= now (excludes null and future)', () => {
    const past = new Date(NOW.getTime() - 86400000).toISOString()
    const future = new Date(NOW.getTime() + 86400000).toISOString()
    const due = dueConcepts(
      [
        { conceptId: 'a', nextReviewAt: past },
        { conceptId: 'b', nextReviewAt: future },
        { conceptId: 'c', nextReviewAt: null },
        { conceptId: 'd', nextReviewAt: NOW.toISOString() },
      ],
      NOW,
    )
    expect(due).toEqual(['a', 'd'])
  })
})
