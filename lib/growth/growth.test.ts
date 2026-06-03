import { describe, it, expect } from 'vitest'
import {
  kstDate,
  prevDate,
  subDays,
  startOfTodayUtc,
  pp,
  withJosa,
  summarizeSessionDeltas,
  buildTodayQuest,
  computeStreak,
  aggregateUnitMastery,
  collapseDailyMastery,
  buildWeeklyParentReport,
  type WeeklyReportInput,
  buildDiagnosticSampleReport,
  type DiagnosticReportInput,
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

describe('withJosa', () => {
  it('uses the with-batchim particle when the last syllable has a final consonant', () => {
    expect(withJosa('곱셈공식', '이', '가')).toBe('곱셈공식이') // 식 has 받침
    expect(withJosa('인수분해식', '은', '는')).toBe('인수분해식은')
  })
  it('uses the no-batchim particle when the last syllable has no final consonant', () => {
    expect(withJosa('다항식의 정리', '이', '가')).toBe('다항식의 정리가') // 리 has no 받침
    expect(withJosa('나머지', '은', '는')).toBe('나머지는')
  })
  it('falls back to the no-batchim particle for non-Hangul endings', () => {
    expect(withJosa('factoring', '이', '가')).toBe('factoring가')
    expect(withJosa('A', '은', '는')).toBe('A는')
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
    attemptedThisWeek: 0,
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

  it('reviewAdherence is counts only (overdueNow from due flags, attemptedThisWeek passthrough)', () => {
    const r = buildWeeklyParentReport({
      ...base,
      sessions: [{ sessionMasteryDelta: 0.1, conceptDeltas: [{ conceptId: 'a', delta: 0.1 }] }],
      mastery: [
        { conceptId: 'a', effectiveMastery: 0.8, due: true, recentWrong: 0 },
        { conceptId: 'b', effectiveMastery: 0.4, due: true, recentWrong: 0 },
        { conceptId: 'c', effectiveMastery: 0.9, due: false, recentWrong: 0 },
      ],
      attemptedThisWeek: 4,
    })
    expect(r.reviewAdherence).toEqual({ overdueNow: 2, attemptedThisWeek: 4 })
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

describe('buildDiagnosticSampleReport', () => {
  const base: DiagnosticReportInput = {
    diagnosticDate: '2026-06-03',
    hasDiagnostic: true,
    attempts: [],
    effByConcept: {},
    blocksDownstreamById: {},
    startableIds: [],
    conceptsWithProblems: [],
    weakAsc: [],
    frontier: [],
    nameById: { a: '다항식 덧셈', b: '곱셈공식', c: '인수분해', d: '나머지정리', e: '항등식' },
    threshold: 0.7,
  }

  it('ranks risk by wrong-first, then mastery asc, then blocksDownstream desc; max 3', () => {
    const r = buildDiagnosticSampleReport({
      ...base,
      attempts: [
        { conceptId: 'a', correct: true },
        { conceptId: 'b', correct: false },
        { conceptId: 'c', correct: false },
        { conceptId: 'd', correct: true },
      ],
      effByConcept: { a: 0.9, b: 0.5, c: 0.5, d: 0.4, e: 0.3 },
      blocksDownstreamById: { b: 1, c: 3 },
    })
    // wrong: b,c (eff equal 0.5) -> c before b (blocks 3>1); then d (correct, eff 0.4 < threshold)
    expect(r.riskConcepts.map((x) => x.conceptId)).toEqual(['c', 'b', 'd'])
    expect(r.riskConcepts[0]).toMatchObject({ conceptId: 'c', wrongInDiagnostic: true, blocksDownstream: 3 })
    // 'a' excluded (correct AND mastery >= threshold)
    expect(r.riskConcepts.find((x) => x.conceptId === 'a')).toBeUndefined()
  })

  it('recovery plan + todayAction include only problem-backed, startable concepts', () => {
    const r = buildDiagnosticSampleReport({
      ...base,
      attempts: [{ conceptId: 'b', correct: false }],
      effByConcept: { b: 0.4, c: 0.3, d: 0.2 },
      startableIds: ['b', 'c'], // d not startable
      conceptsWithProblems: ['b', 'c'], // d has no problems
      weakAsc: ['d', 'c'], // d filtered (not startable/no problems) -> c for day1_2
    })
    // day3_5/day6_7 = risk concept b (problem-backed)
    expect(r.recoveryPlan.find((d) => d.bucket === 'day3_5')!.concepts.map((c) => c.conceptId)).toEqual(['b'])
    expect(r.recoveryPlan.find((d) => d.bucket === 'day6_7')!.concepts.map((c) => c.conceptId)).toEqual(['b'])
    // day1_2 = weak prereq c (startable + problems + not a risk concept)
    expect(r.recoveryPlan.find((d) => d.bucket === 'day1_2')!.concepts.map((c) => c.conceptId)).toEqual(['c'])
    // today action = first startable+playable: risk b
    expect(r.todayAction).toMatchObject({ conceptId: 'b', kind: 'review' })
  })

  it('todayAction falls back to frontier when no risk/prereq is startable+playable', () => {
    const r = buildDiagnosticSampleReport({
      ...base,
      attempts: [{ conceptId: 'b', correct: false }],
      effByConcept: { b: 0.4 },
      startableIds: ['e'], // b not startable
      conceptsWithProblems: ['e'],
      weakAsc: [],
      frontier: ['e'],
    })
    expect(r.todayAction).toMatchObject({ conceptId: 'e', kind: 'frontier' })
  })

  it('todayAction is null when nothing is startable + problem-backed', () => {
    const r = buildDiagnosticSampleReport({
      ...base,
      attempts: [{ conceptId: 'b', correct: false }],
      effByConcept: { b: 0.4 },
      startableIds: [],
      conceptsWithProblems: [],
      frontier: ['b'],
    })
    expect(r.todayAction).toBeNull()
  })

  it("state='empty' with no diagnostic and no attempts", () => {
    const r = buildDiagnosticSampleReport({ ...base, hasDiagnostic: false })
    expect(r.state).toBe('empty')
    expect(r.riskConcepts).toEqual([])
  })

  it("state='sparse' when diagnostic done but no risk concepts surface", () => {
    const r = buildDiagnosticSampleReport({
      ...base,
      attempts: [{ conceptId: 'a', correct: true }],
      effByConcept: { a: 0.9 }, // above threshold, correct -> not risky
    })
    expect(r.state).toBe('sparse')
    expect(r.conclusion).toContain('초기 진단 기준')
  })

  it("state='ok' names the top risk cautiously; conclusion has 초기 진단 기준 and no forbidden words", () => {
    const r = buildDiagnosticSampleReport({
      ...base,
      attempts: [{ conceptId: 'b', correct: false }],
      effByConcept: { b: 0.4 },
    })
    expect(r.state).toBe('ok')
    expect(r.conclusion).toContain('초기 진단 기준')
    expect(r.conclusion).toContain('곱셈공식')
    expect(r.conclusion).toContain('흔들려 보여요') // hedged, not definitive
    expect(r.conclusion).not.toMatch(/점수|등급|상승|보장/)
  })
})
