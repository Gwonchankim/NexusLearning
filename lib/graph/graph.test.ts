import { describe, it, expect } from 'vitest'
import {
  frontier,
  recommend,
  isStartable,
  type ConceptNode,
  type ConceptSignal,
  type RecommendInput,
} from './index'

// Helpers --------------------------------------------------------------------
const node = (id: string, orderIndex: number, prereqIds: string[] = []): ConceptNode => ({
  id,
  unitId: 'u',
  prereqIds,
  orderIndex,
})
const sig = (effectiveMastery: number, due = false): ConceptSignal => ({ effectiveMastery, due })
const input = (
  concepts: ConceptNode[],
  signalByConcept: Record<string, ConceptSignal>,
): RecommendInput => ({ concepts, signalByConcept }) // threshold default 0.7

// A small DAG: c1 root; c2,c3 depend on c1; c4 depends on c2 & c3.
const c1 = node('c1', 1)
const c2 = node('c2', 2, ['c1'])
const c3 = node('c3', 3, ['c1'])
const c4 = node('c4', 4, ['c2', 'c3'])
const dag = [c1, c2, c3, c4]

describe('status classification', () => {
  it('root with eff 0 is available; partially-learned root is in_progress; >=T is mastered', () => {
    expect(recommend(input([c1], { c1: sig(0) })).statuses.c1).toBe('available')
    expect(recommend(input([c1], { c1: sig(0.5) })).statuses.c1).toBe('in_progress')
    expect(recommend(input([c1], { c1: sig(0.8) })).statuses.c1).toBe('mastered')
  })

  it('locks a concept whose prerequisite is below threshold', () => {
    const r = recommend(input(dag, { c1: sig(0.5) }))
    expect(r.statuses.c2).toBe('locked')
    expect(r.statuses.c4).toBe('locked')
  })

  it('unlocks a concept once all prerequisites reach threshold', () => {
    const r = recommend(input(dag, { c1: sig(0.8) }))
    expect(r.statuses.c2).toBe('available') // prereq met, eff 0
    expect(r.statuses.c4).toBe('locked') // c2,c3 not yet mastered
  })

  it('treats a missing prerequisite id as unmet (locked)', () => {
    const x = node('x', 1, ['ghost'])
    expect(recommend(input([x], { x: sig(0) })).statuses.x).toBe('locked')
  })
})

describe('frontier membership', () => {
  it('includes available + in_progress, excludes locked and mastered', () => {
    // c1 mastered, c2 available, c3 in_progress, c4 locked (needs c2,c3 mastered).
    const r = recommend(
      input(dag, { c1: sig(0.9), c2: sig(0), c3: sig(0.4) }),
    )
    expect(r.statuses).toMatchObject({
      c1: 'mastered',
      c2: 'available',
      c3: 'in_progress',
      c4: 'locked',
    })
    expect(new Set(r.frontier)).toEqual(new Set(['c2', 'c3']))
  })
})

describe('frontier ordering — one criterion isolated per test', () => {
  it('① sorts by average prerequisite mastery descending (over order_index)', () => {
    const p1 = node('p1', 10)
    const p2 = node('p2', 11)
    const x = node('x', 2, ['p1']) // higher prereq avg
    const y = node('y', 1, ['p2']) // lower prereq avg, but earlier order_index
    const f = frontier(
      input([p1, p2, x, y], { p1: sig(0.9), p2: sig(0.7), x: sig(0), y: sig(0) }),
    )
    expect(f).toEqual(['x', 'y'])
  })

  it('② breaks ties by own effective mastery ascending', () => {
    const p = node('p', 10)
    const x = node('x', 2, ['p']) // eff 0.5
    const y = node('y', 1, ['p']) // eff 0.2, earlier order_index
    const f = frontier(input([p, x, y], { p: sig(0.8), x: sig(0.5), y: sig(0.2) }))
    expect(f).toEqual(['y', 'x'])
  })

  it('③ breaks further ties by due first', () => {
    const p = node('p', 10)
    const x = node('x', 2, ['p']) // due
    const y = node('y', 1, ['p']) // not due, earlier order_index
    const f = frontier(
      input([p, x, y], { p: sig(0.8), x: sig(0.3, true), y: sig(0.3, false) }),
    )
    expect(f).toEqual(['x', 'y'])
  })

  it('④ breaks final ties by order_index ascending', () => {
    const p = node('p', 10)
    const x = node('x', 1, ['p'])
    const y = node('y', 2, ['p'])
    const f = frontier(input([p, x, y], { p: sig(0.8), x: sig(0.3), y: sig(0.3) }))
    expect(f).toEqual(['x', 'y'])
  })
})

describe('recommended — frontier', () => {
  it('recommends the top frontier concept with source "frontier"', () => {
    const r = recommend(input(dag, { c1: sig(0.9) }))
    expect(r.recommended).toEqual({ conceptId: 'c2', source: 'frontier' })
  })
})

describe('recommended — fallback (all mastered ⇒ empty frontier)', () => {
  it('prefers a due concept (lowest eff) with reason review_due', () => {
    const r = recommend(
      input(dag, {
        c1: sig(0.95),
        c2: sig(0.9, true),
        c3: sig(0.8, true),
        c4: sig(0.85),
      }),
    )
    expect(r.frontier).toEqual([])
    expect(r.recommended).toEqual({ conceptId: 'c3', source: 'fallback', reason: 'review_due' })
  })

  it('falls to weakest mastered when nothing is due', () => {
    const r = recommend(
      input(dag, { c1: sig(0.95), c2: sig(0.8), c3: sig(0.75), c4: sig(0.9) }),
    )
    expect(r.recommended).toEqual({
      conceptId: 'c3',
      source: 'fallback',
      reason: 'weakest_mastered',
    })
  })

  it('uses order_index to break eff ties deterministically', () => {
    const r = recommend(input(dag, { c1: sig(0.8), c2: sig(0.8), c3: sig(0.8), c4: sig(0.8) }))
    expect(r.recommended).toEqual({
      conceptId: 'c1',
      source: 'fallback',
      reason: 'weakest_mastered',
    })
  })
})

describe('recommended — null (degenerate / abnormal data)', () => {
  it('returns null for empty concepts', () => {
    const r = recommend(input([], {}))
    expect(r.frontier).toEqual([])
    expect(r.recommended).toBeNull()
  })

  it('returns null (no infinite loop) when a cycle locks everything', () => {
    const a = node('a', 1, ['b'])
    const b = node('b', 2, ['a'])
    const r = recommend(input([a, b], { a: sig(0.2), b: sig(0.3) }))
    expect(r.statuses).toEqual({ a: 'locked', b: 'locked' })
    expect(r.frontier).toEqual([])
    expect(r.recommended).toBeNull()
  })
})

describe('isStartable', () => {
  it('rejects locked concepts', () => {
    const r = recommend(input(dag, { c1: sig(0.5) }))
    expect(isStartable(r, 'c2')).toBe(false)
  })

  it('allows frontier concepts', () => {
    const r = recommend(input(dag, { c1: sig(0.9) }))
    expect(isStartable(r, 'c2')).toBe(true)
  })

  it('allows the fallback (mastered) recommendation but not other mastered concepts', () => {
    const r = recommend(
      input(dag, { c1: sig(0.95), c2: sig(0.8), c3: sig(0.75), c4: sig(0.9) }),
    )
    expect(r.recommended?.conceptId).toBe('c3')
    expect(isStartable(r, 'c3')).toBe(true) // recommended fallback target
    expect(isStartable(r, 'c1')).toBe(false) // mastered but not recommended/frontier
  })
})
