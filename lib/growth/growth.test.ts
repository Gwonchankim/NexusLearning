import { describe, it, expect } from 'vitest'
import {
  kstDate,
  prevDate,
  startOfTodayUtc,
  pp,
  summarizeSessionDeltas,
  buildTodayQuest,
  computeStreak,
} from './index'

describe('KST utils', () => {
  it('kstDate puts the UTC->KST midnight boundary at 15:00Z', () => {
    expect(kstDate(new Date('2026-05-25T14:59:59Z'))).toBe('2026-05-25')
    expect(kstDate(new Date('2026-05-25T15:00:00Z'))).toBe('2026-05-26')
  })
  it('prevDate steps back one day across month boundary', () => {
    expect(prevDate('2026-05-26')).toBe('2026-05-25')
    expect(prevDate('2026-06-01')).toBe('2026-05-31')
  })
  it('startOfTodayUtc is KST midnight as UTC', () => {
    expect(startOfTodayUtc('2026-05-26')).toBe('2026-05-25T15:00:00.000Z')
  })
  it('pp rounds a 0..1 fraction to %', () => {
    expect(pp(0.123)).toBe(12)
    expect(pp(0.125)).toBe(13)
    expect(pp(-0.04)).toBe(-4)
  })
})

describe('summarizeSessionDeltas', () => {
  it('returns null when no concepts attempted', () => {
    expect(summarizeSessionDeltas({ conceptIds: [], startMastery: { a: 0.5 }, afterMastery: {} })).toEqual({
      conceptDeltas: [],
      sessionMasteryDelta: null,
    })
  })
  it('returns null when startMastery snapshot is absent', () => {
    expect(
      summarizeSessionDeltas({ conceptIds: ['a'], startMastery: null, afterMastery: { a: 0.8 } }),
    ).toEqual({ conceptDeltas: [], sessionMasteryDelta: null })
  })
  it('computes signed per-concept delta and their mean', () => {
    const r = summarizeSessionDeltas({
      conceptIds: ['a', 'b'],
      startMastery: { a: 0.4, b: 0.6 },
      afterMastery: { a: 0.7, b: 0.5 }, // +0.3, -0.1
    })
    expect(r.conceptDeltas).toEqual([
      { conceptId: 'a', before: 0.4, after: 0.7, delta: expect.closeTo(0.3, 10) },
      { conceptId: 'b', before: 0.6, after: 0.5, delta: expect.closeTo(-0.1, 10) },
    ])
    expect(r.sessionMasteryDelta).toBeCloseTo(0.1, 10) // mean(0.3, -0.1)
  })
  it('treats missing before/after as 0', () => {
    const r = summarizeSessionDeltas({ conceptIds: ['a'], startMastery: {}, afterMastery: { a: 0.5 } })
    expect(r.conceptDeltas[0]).toEqual({ conceptId: 'a', before: 0, after: 0.5, delta: 0.5 })
    expect(r.sessionMasteryDelta).toBeCloseTo(0.5, 10)
  })
})

describe('buildTodayQuest', () => {
  it('selects new from frontier and review from due, marks done, excludes locked', () => {
    const q = buildTodayQuest({
      frontier: ['a', 'b', 'c'],
      due: ['d', 'e', 'f', 'g'],
      weakAsc: ['h'],
      locked: ['c'],
      todayConceptIds: ['a', 'd'],
    })
    expect(q.items.map((i) => i.conceptId)).toEqual(['a', 'b', 'd', 'e', 'f'])
    expect(q.newTotal).toBe(2)
    expect(q.newDone).toBe(1)
    expect(q.reviewTotal).toBe(3)
    expect(q.reviewDone).toBe(1)
    expect(q.items.find((i) => i.conceptId === 'c')).toBeUndefined()
  })
  it('fills review shortfall from weakAsc and never pads beyond availability', () => {
    const q = buildTodayQuest({
      frontier: ['a'],
      due: ['d'],
      weakAsc: ['w1', 'w2', 'w3'],
      locked: [],
      todayConceptIds: [],
    })
    expect(q.items.filter((i) => i.kind === 'new').map((i) => i.conceptId)).toEqual(['a'])
    expect(q.items.filter((i) => i.kind === 'review').map((i) => i.conceptId)).toEqual(['d', 'w1', 'w2'])
    expect(q.newTotal).toBe(1)
    expect(q.reviewTotal).toBe(3)
  })
  it('dedupes a concept that is both frontier and due (new wins)', () => {
    const q = buildTodayQuest({ frontier: ['a'], due: ['a', 'd'], weakAsc: [], locked: [], todayConceptIds: [] })
    expect(q.items.map((i) => i.conceptId)).toEqual(['a', 'd'])
    expect(q.items.find((i) => i.conceptId === 'a')!.kind).toBe('new')
  })
})

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-05-25', '2026-05-24', '2026-05-23'], '2026-05-25')).toEqual({
      current: 3,
      todayDone: true,
    })
  })
  it('counts from yesterday when today not done', () => {
    expect(computeStreak(['2026-05-25', '2026-05-24'], '2026-05-26')).toEqual({
      current: 2,
      todayDone: false,
    })
  })
  it('stops at a gap', () => {
    expect(computeStreak(['2026-05-25', '2026-05-23'], '2026-05-25')).toEqual({
      current: 1,
      todayDone: true,
    })
  })
  it('handles empty and duplicate dates', () => {
    expect(computeStreak([], '2026-05-25')).toEqual({ current: 0, todayDone: false })
    expect(computeStreak(['2026-05-25', '2026-05-25', '2026-05-24'], '2026-05-25')).toEqual({
      current: 2,
      todayDone: true,
    })
  })
  it('is zero when neither today nor yesterday present', () => {
    expect(computeStreak(['2026-05-20'], '2026-05-25')).toEqual({ current: 0, todayDone: false })
  })
})
