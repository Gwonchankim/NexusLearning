// Prerequisite DAG + frontier recommendation (PLAN.md §5.3). Pure module —
// no Supabase/Next imports; unit tested. The server helper fetches concepts /
// prerequisites / concept_mastery, derives per-concept signals, and calls these.

export interface ConceptNode {
  id: string
  unitId: string
  prereqIds: string[]
  orderIndex: number
}

export type NodeStatus = 'locked' | 'available' | 'in_progress' | 'mastered'

/** Per-concept runtime signal (decay-applied mastery + whether review is due). */
export interface ConceptSignal {
  effectiveMastery: number
  due: boolean
}

export interface RecommendInput {
  concepts: ConceptNode[]
  signalByConcept: Record<string, ConceptSignal> // missing concept ⇒ {effectiveMastery:0, due:false}
  threshold?: number
}

export interface Recommendation {
  statuses: Record<string, NodeStatus>
  /** Startable frontier candidates (available + in_progress), sorted. */
  frontier: string[]
  recommended: {
    conceptId: string
    source: 'frontier' | 'fallback'
    reason?: 'review_due' | 'weakest_mastered' // only set for fallback
  } | null
}

export const GRAPH_DEFAULTS = {
  masteryThreshold: 0.7,
} as const

const ZERO_SIGNAL: ConceptSignal = { effectiveMastery: 0, due: false }

function makeHelpers(input: RecommendInput) {
  const threshold = input.threshold ?? GRAPH_DEFAULTS.masteryThreshold
  const sig = (id: string): ConceptSignal => input.signalByConcept[id] ?? ZERO_SIGNAL
  const eff = (id: string): number => sig(id).effectiveMastery
  // All direct prerequisites at/above threshold (empty prereqs ⇒ root ⇒ met).
  const prereqMet = (node: ConceptNode): boolean =>
    node.prereqIds.every((p) => eff(p) >= threshold)
  // Average prerequisite effective mastery; roots count as fully satisfied (1.0).
  const avgPrereqEff = (node: ConceptNode): number =>
    node.prereqIds.length === 0
      ? 1
      : node.prereqIds.reduce((sum, p) => sum + eff(p), 0) / node.prereqIds.length
  const status = (node: ConceptNode): NodeStatus => {
    if (eff(node.id) >= threshold) return 'mastered'
    if (!prereqMet(node)) return 'locked'
    return eff(node.id) === 0 ? 'available' : 'in_progress'
  }
  return { sig, eff, prereqMet, avgPrereqEff, status }
}

/** Startable frontier candidates (available + in_progress), sorted per PLAN §5.3. */
export function frontier(input: RecommendInput): string[] {
  const { eff, sig, avgPrereqEff, status } = makeHelpers(input)
  return input.concepts
    .filter((c) => {
      const s = status(c)
      return s === 'available' || s === 'in_progress'
    })
    .sort((a, b) => {
      const ap = avgPrereqEff(a)
      const bp = avgPrereqEff(b)
      if (ap !== bp) return bp - ap // ① prereq satisfaction desc
      const ae = eff(a.id)
      const be = eff(b.id)
      if (ae !== be) return ae - be // ② own effective mastery asc
      const ad = sig(a.id).due ? 0 : 1
      const bd = sig(b.id).due ? 0 : 1
      if (ad !== bd) return ad - bd // ③ due first
      return a.orderIndex - b.orderIndex // ④ order_index asc
    })
    .map((c) => c.id)
}

export function recommend(input: RecommendInput): Recommendation {
  const { sig, eff, status } = makeHelpers(input)

  const statuses: Record<string, NodeStatus> = {}
  for (const c of input.concepts) statuses[c.id] = status(c)

  const frontierList = frontier(input)

  let recommended: Recommendation['recommended'] = null
  if (frontierList.length > 0) {
    recommended = { conceptId: frontierList[0], source: 'frontier' }
  } else {
    // Fallback: only non-locked (i.e. mastered) concepts are startable for review.
    const pool = input.concepts.filter((c) => statuses[c.id] !== 'locked')
    const duePool = pool.filter((c) => sig(c.id).due)
    const candidates = duePool.length ? duePool : pool
    if (candidates.length) {
      const reason = duePool.length ? 'review_due' : 'weakest_mastered'
      const pick = candidates.reduce((best, c) =>
        eff(c.id) < eff(best.id) || (eff(c.id) === eff(best.id) && c.orderIndex < best.orderIndex)
          ? c
          : best,
      )
      recommended = { conceptId: pick.id, source: 'fallback', reason }
    }
  }

  return { statuses, frontier: frontierList, recommended }
}

/** Whether a session may be started for `conceptId` given the recommendation. */
export function isStartable(rec: Recommendation, conceptId: string): boolean {
  return (
    rec.statuses[conceptId] !== 'locked' &&
    (rec.frontier.includes(conceptId) || rec.recommended?.conceptId === conceptId)
  )
}
