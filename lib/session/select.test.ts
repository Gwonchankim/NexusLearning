import { describe, it, expect } from 'vitest'
import {
  selectSessionProblems,
  type ConceptInfo,
  type ProblemInfo,
  type ConceptProgress,
} from './select'

const NOW = new Date('2026-05-25T00:00:00.000Z')
const PAST = new Date(NOW.getTime() - 86400000).toISOString()
const FUTURE = new Date(NOW.getTime() + 86400000).toISOString()

const concepts: ConceptInfo[] = [
  { id: 'c1', orderIndex: 1 },
  { id: 'c2', orderIndex: 2 },
  { id: 'c3', orderIndex: 3 },
]

const reviewedProblems: ProblemInfo[] = [
  { id: 'p1a', conceptId: 'c1', difficulty: 'easy' },
  { id: 'p1b', conceptId: 'c1', difficulty: 'medium' },
  { id: 'p2a', conceptId: 'c2', difficulty: 'easy' },
  { id: 'p3a', conceptId: 'c3', difficulty: 'easy' },
  { id: 'p3b', conceptId: 'c3', difficulty: 'hard' },
]

describe('diagnostic mode', () => {
  it('picks the easiest problem from each concept in order_index order', () => {
    const picks = selectSessionProblems({
      concepts,
      progress: [],
      reviewedProblems,
      mode: 'diagnostic',
      now: NOW,
    })
    expect(picks).toEqual(['p1a', 'p2a', 'p3a'])
  })
})

describe('practice mode — ordering', () => {
  it('puts due concepts first, then weakest (effective mastery asc)', () => {
    const progress: ConceptProgress[] = [
      { conceptId: 'c1', mastery: 0.9, lastReviewedAt: NOW.toISOString(), nextReviewAt: FUTURE },
      { conceptId: 'c3', mastery: 0.6, lastReviewedAt: NOW.toISOString(), nextReviewAt: PAST }, // due
      // c2 has no progress -> mastery 0 (weakest among non-due)
    ]
    const picks = selectSessionProblems({ concepts, progress, reviewedProblems, mode: 'practice', now: NOW })
    expect(picks.slice(0, 3)).toEqual(['p3a', 'p2a', 'p1a'])
  })

  it('orders non-due concepts by effective mastery ascending', () => {
    const progress: ConceptProgress[] = [
      { conceptId: 'c1', mastery: 0.8, lastReviewedAt: NOW.toISOString(), nextReviewAt: FUTURE },
      { conceptId: 'c2', mastery: 0.2, lastReviewedAt: NOW.toISOString(), nextReviewAt: FUTURE },
      { conceptId: 'c3', mastery: 0.5, lastReviewedAt: NOW.toISOString(), nextReviewAt: FUTURE },
    ]
    const picks = selectSessionProblems({ concepts, progress, reviewedProblems, mode: 'practice', now: NOW })
    expect(picks.slice(0, 3)).toEqual(['p2a', 'p3a', 'p1a'])
  })
})

describe('practice mode — limits', () => {
  it('respects the session limit', () => {
    const picks = selectSessionProblems({
      concepts,
      progress: [],
      reviewedProblems,
      mode: 'practice',
      now: NOW,
      limit: 2,
    })
    expect(picks).toHaveLength(2)
  })

  it('serves at most 2 problems per concept and never duplicates', () => {
    const single: ProblemInfo[] = [
      { id: 'q1', conceptId: 'c1', difficulty: 'easy' },
      { id: 'q2', conceptId: 'c1', difficulty: 'medium' },
      { id: 'q3', conceptId: 'c1', difficulty: 'hard' },
    ]
    const picks = selectSessionProblems({
      concepts: [{ id: 'c1', orderIndex: 1 }],
      progress: [],
      reviewedProblems: single,
      mode: 'practice',
      now: NOW,
      limit: 5,
    })
    expect(picks).toEqual(['q1', 'q2'])
    expect(new Set(picks).size).toBe(picks.length)
  })
})

describe('practice mode — focus concept (PR4)', () => {
  it('serves only the focused concept, easiest first, up to the limit', () => {
    const picks = selectSessionProblems({
      concepts,
      progress: [],
      reviewedProblems, // c1: p1a(easy), p1b(medium); c2: p2a; c3: p3a(easy), p3b(hard)
      mode: 'practice',
      now: NOW,
      focusConceptId: 'c1',
      limit: 5,
    })
    expect(picks).toEqual(['p1a', 'p1b']) // bypasses the 2-per-concept round-robin cap
  })

  it('returns an empty list when the focused concept has no reviewed problems', () => {
    const picks = selectSessionProblems({
      concepts,
      progress: [],
      reviewedProblems,
      mode: 'practice',
      now: NOW,
      focusConceptId: 'nope',
    })
    expect(picks).toEqual([])
  })
})
