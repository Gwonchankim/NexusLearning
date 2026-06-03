import { describe, it, expect } from 'vitest'
import {
  kstDate,
  prevDate,
  subDays,
  startOfTodayUtc,
  pp,
  summarizeSessionDeltas,
  buildTodayQuest,
  computeStreak,
  aggregateUnitMastery,
  collapseDailyMastery,
  buildWeeklyParentReport,
  type WeeklyReportInput,
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
  it('subDays steps back N days, including across month boundaries', () => {
    expect(subDays('2026-06-03', 0)).toBe('2026-06-03')
    expect(subDays('2026-06-03', 1)).toBe('2026-06-02')
    expect(subDays('2026-06-03', 29)).toBe('2026-05-05')
    expect(subDays('2026-03-01', 1)).toBe('2026-02-28')
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

describe('aggregateUnitMastery', () => {
  it('returns [] for empty input', () => {
    expect(aggregateUnitMastery([])).toEqual([])
  })
  it('averages a single unit', () => {
    expect(
      aggregateUnitMastery([
        { unitId: 'u1', mastery: 0.4 },
        { unitId: 'u1', mastery: 0.6 },
      ]),
    ).toEqual([{ unitId: 'u1', masteryAvg: expect.closeTo(0.5, 10) }])
  })
  it('averages independently per unit', () => {
    const r = aggregateUnitMastery([
      { unitId: 'u1', mastery: 0.2 },
      { unitId: 'u2', mastery: 0.8 },
      { unitId: 'u1', mastery: 0.4 },
    ])
    expect(r).toEqual([
      { unitId: 'u1', masteryAvg: expect.closeTo(0.3, 10) },
      { unitId: 'u2', masteryAvg: expect.closeTo(0.8, 10) },
    ])
  })
})

describe('collapseDailyMastery', () => {
  it('returns [] for empty input', () => {
    expect(collapseDailyMastery([])).toEqual([])
  })
  it('passes a single unit per date through, sorted ascending', () => {
    expect(
      collapseDailyMastery([
        { date: '2026-06-02', masteryAvg: 0.5 },
        { date: '2026-06-01', masteryAvg: 0.3 },
      ]),
    ).toEqual([
      { date: '2026-06-01', masteryAvg: 0.3 },
      { date: '2026-06-02', masteryAvg: 0.5 },
    ])
  })
  it('averages multiple units on the same date', () => {
    expect(
      collapseDailyMastery([
        { date: '2026-06-01', masteryAvg: 0.4 },
        { date: '2026-06-01', masteryAvg: 0.6 },
      ]),
    ).toEqual([{ date: '2026-06-01', masteryAvg: expect.closeTo(0.5, 10) }])
  })
})

describe('buildWeeklyParentReport', () => {
  const base: WeeklyReportInput = {
    weekStart: '2026-05-28',
    weekEnd: '2026-06-03',
    sessions: [],
    mastery: [],
    reviewedThisWeek: 0,
    dueConceptIds: [],
    weakAsc: [],
    frontier: [],
    nameById: { a: '다항식 덧셈', b: '곱셈공식', c: '인수분해', d: '나머지정리' },
    threshold: 0.7,
  }

  it('ranks top growth by cumulative delta desc, positive only, max 3', () => {
    const r = buildWeeklyParentReport({
      ...base,
      sessions: [
        { sessionMasteryDelta: 0.1, conceptDeltas: [{ conceptId: 'a', delta: 0.1 }, { conceptId: 'b', delta: 0.05 }] },
        { sessionMasteryDelta: 0.2, conceptDeltas: [{ conceptId: 'b', delta: 0.2 }, { conceptId: 'c', delta: -0.1 }] },
        { sessionMasteryDelta: 0.05, conceptDeltas: [{ conceptId: 'd', delta: 0.05 }] },
      ],
    })
    // b: 0.25, a: 0.1, d: 0.05  (c excluded: net -0.1)
    expect(r.topGrowth.map((g) => g.conceptId)).toEqual(['b', 'a', 'd'])
    expect(r.topGrowth[0]).toEqual({ conceptId: 'b', name: '곱셈공식', delta: expect.closeTo(0.25, 10), sessions: 2 })
    expect(r.topGrowth.find((g) => g.conceptId === 'c')).toBeUndefined()
  })

  it('excludes concepts whose net weekly delta is zero or negative', () => {
    const r = buildWeeklyParentReport({
      ...base,
      mastery: [{ conceptId: 'a', effectiveMastery: 0.8, due: false, recentWrong: 0 }],
      sessions: [
        { sessionMasteryDelta: 0, conceptDeltas: [{ conceptId: 'a', delta: 0.1 }, { conceptId: 'a', delta: -0.1 }] },
        { sessionMasteryDelta: -0.2, conceptDeltas: [{ conceptId: 'b', delta: -0.2 }] },
      ],
    })
    expect(r.topGrowth).toEqual([])
  })

  it('ranks risk concepts by effectiveMastery asc, filtering below-threshold + (due or recent wrong)', () => {
    const r = buildWeeklyParentReport({
      ...base,
      sessions: [{ sessionMasteryDelta: 0.1, conceptDeltas: [{ conceptId: 'a', delta: 0.1 }] }],
      mastery: [
        { conceptId: 'a', effectiveMastery: 0.9, due: true, recentWrong: 2 }, // excluded: above threshold
        { conceptId: 'b', effectiveMastery: 0.4, due: true, recentWrong: 0 }, // included
        { conceptId: 'c', effectiveMastery: 0.2, due: false, recentWrong: 3 }, // included (recent wrong)
        { conceptId: 'd', effectiveMastery: 0.5, due: false, recentWrong: 0 }, // excluded: not due, no wrong
      ],
    })
    expect(r.riskConcepts.map((x) => x.conceptId)).toEqual(['c', 'b'])
    expect(r.riskConcepts[0]).toMatchObject({ conceptId: 'c', name: '인수분해', recentWrong: 3 })
  })

  it('orders actions review -> prereq -> frontier, dedups, max 3', () => {
    const r = buildWeeklyParentReport({
      ...base,
      sessions: [{ sessionMasteryDelta: 0.1, conceptDeltas: [{ conceptId: 'a', delta: 0.1 }] }],
      mastery: [{ conceptId: 'a', effectiveMastery: 0.8, due: false, recentWrong: 0 }],
      dueConceptIds: ['b'],
      weakAsc: ['b', 'c'], // 'b' already taken by review -> dedup
      frontier: ['d'],
    })
    expect(r.actions.map((x) => [x.kind, x.conceptId])).toEqual([
      ['review', 'b'],
      ['prereq', 'c'],
      ['frontier', 'd'],
    ])
  })

  it('reviewAdherence is counts only (overdueNow from due flags, reviewedThisWeek passthrough)', () => {
    const r = buildWeeklyParentReport({
      ...base,
      sessions: [{ sessionMasteryDelta: 0.1, conceptDeltas: [{ conceptId: 'a', delta: 0.1 }] }],
      mastery: [
        { conceptId: 'a', effectiveMastery: 0.8, due: true, recentWrong: 0 },
        { conceptId: 'b', effectiveMastery: 0.4, due: true, recentWrong: 0 },
        { conceptId: 'c', effectiveMastery: 0.9, due: false, recentWrong: 0 },
      ],
      reviewedThisWeek: 4,
    })
    expect(r.reviewAdherence).toEqual({ overdueNow: 2, reviewedThisWeek: 4 })
    expect(r).not.toHaveProperty('reviewAdherence.rate')
  })

  it('weeklyMasteryDelta sums deltas, treats null as 0; null only when every session lacks a delta', () => {
    const summed = buildWeeklyParentReport({
      ...base,
      sessions: [
        { sessionMasteryDelta: 0.1, conceptDeltas: [{ conceptId: 'a', delta: 0.1 }] },
        { sessionMasteryDelta: null, conceptDeltas: [] },
      ],
    })
    expect(summed.weeklyMasteryDelta).toBeCloseTo(0.1, 10)

    const allNull = buildWeeklyParentReport({
      ...base,
      sessions: [{ sessionMasteryDelta: null, conceptDeltas: [] }],
    })
    expect(allNull.weeklyMasteryDelta).toBeNull()
  })

  it("state='empty' when no sessions and no mastery", () => {
    const r = buildWeeklyParentReport({ ...base })
    expect(r.state).toBe('empty')
    expect(r.completedSessions).toBe(0)
    expect(r.conclusion).toContain('아직 없어요')
  })

  it("state='sparse' when mastery exists but no completed sessions; conclusion stays cautious", () => {
    const r = buildWeeklyParentReport({
      ...base,
      mastery: [{ conceptId: 'b', effectiveMastery: 0.3, due: true, recentWrong: 1 }],
    })
    expect(r.state).toBe('sparse')
    expect(r.topGrowth).toEqual([])
    expect(r.conclusion).toContain('데이터가 부족')
    expect(r.conclusion).toContain('곱셈공식') // names the top risk cautiously
  })

  it("state='ok' when sessions produced positive growth; conclusion mentions growth and risk", () => {
    const r = buildWeeklyParentReport({
      ...base,
      sessions: [{ sessionMasteryDelta: 0.2, conceptDeltas: [{ conceptId: 'a', delta: 0.2 }] }],
      mastery: [
        { conceptId: 'a', effectiveMastery: 0.8, due: false, recentWrong: 0 },
        { conceptId: 'b', effectiveMastery: 0.3, due: true, recentWrong: 0 },
      ],
    })
    expect(r.state).toBe('ok')
    expect(r.conclusion).toContain('다항식 덧셈') // grew
    expect(r.conclusion).toContain('곱셈공식') // risk
    // no exaggeration: never claims a score increase
    expect(r.conclusion).not.toMatch(/점수|등급|상승/)
  })
})
