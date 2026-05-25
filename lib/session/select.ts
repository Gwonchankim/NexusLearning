// Pure session problem-selection (PR3). No Supabase/Next imports — unit tested.
// The server action fetches concepts / concept_mastery / reviewed problems and
// passes them here; this module only decides WHICH problems (and order) to serve.
// NOTE: this is a flat ordering, NOT the prerequisite-graph frontier (that is PR4).

import { effectiveMastery } from '../adaptive'
import { dueConcepts } from '../scheduler'

export type SessionMode = 'practice' | 'diagnostic'
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface ConceptInfo {
  id: string
  orderIndex: number
}

export interface ConceptProgress {
  conceptId: string
  mastery: number
  lastReviewedAt: string | null
  nextReviewAt: string | null
}

export interface ProblemInfo {
  id: string
  conceptId: string
  difficulty: Difficulty
}

export interface SelectInput {
  concepts: ConceptInfo[]
  progress: ConceptProgress[] // existing concept_mastery rows (may be empty)
  reviewedProblems: ProblemInfo[] // reviewed=true problems only
  mode: SessionMode
  now?: Date
  limit?: number
}

const DEFAULT_LIMIT: Record<SessionMode, number> = { practice: 8, diagnostic: 6 }
const MAX_PER_CONCEPT = 2
const DIAGNOSTIC_CONCEPTS = 6
const DIFFICULTY_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 }

/** Returns an ordered list of problem ids to serve in the session. */
export function selectSessionProblems(input: SelectInput): string[] {
  const { concepts, progress, reviewedProblems, mode } = input
  const now = input.now ?? new Date()
  const limit = input.limit ?? DEFAULT_LIMIT[mode]

  // Group reviewed problems by concept, easiest first (stable by id).
  const byConcept = new Map<string, ProblemInfo[]>()
  for (const p of reviewedProblems) {
    const arr = byConcept.get(p.conceptId) ?? []
    arr.push(p)
    byConcept.set(p.conceptId, arr)
  }
  for (const arr of byConcept.values()) {
    arr.sort(
      (a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty] || a.id.localeCompare(b.id),
    )
  }

  const conceptsWithProblems = concepts.filter((c) => (byConcept.get(c.id)?.length ?? 0) > 0)

  if (mode === 'diagnostic') {
    // First few concepts by order_index, one (easiest) problem each.
    const ordered = [...conceptsWithProblems].sort((a, b) => a.orderIndex - b.orderIndex)
    const picks: string[] = []
    for (const c of ordered.slice(0, Math.min(DIAGNOSTIC_CONCEPTS, limit))) {
      picks.push(byConcept.get(c.id)![0].id)
      if (picks.length >= limit) break
    }
    return picks
  }

  // practice: due concepts first, then weakest (effective mastery asc), then order_index.
  const progressByConcept = new Map(progress.map((p) => [p.conceptId, p]))
  const effMastery = (conceptId: string): number => {
    const pr = progressByConcept.get(conceptId)
    if (!pr) return 0
    return effectiveMastery(
      { mastery: pr.mastery, attemptsCount: 0, lastReviewedAt: pr.lastReviewedAt },
      now,
    )
  }
  const dueSet = new Set(
    dueConcepts(
      progress.map((p) => ({ conceptId: p.conceptId, nextReviewAt: p.nextReviewAt })),
      now,
    ),
  )

  const ordered = [...conceptsWithProblems].sort((a, b) => {
    const aDue = dueSet.has(a.id) ? 0 : 1
    const bDue = dueSet.has(b.id) ? 0 : 1
    if (aDue !== bDue) return aDue - bDue
    const am = effMastery(a.id)
    const bm = effMastery(b.id)
    if (am !== bm) return am - bm
    return a.orderIndex - b.orderIndex
  })

  // Round-robin so a session spans multiple concepts before doubling up.
  const picks: string[] = []
  const used = new Set<string>()
  for (let pass = 0; pass < MAX_PER_CONCEPT && picks.length < limit; pass++) {
    for (const c of ordered) {
      if (picks.length >= limit) break
      const next = byConcept.get(c.id)!.find((p) => !used.has(p.id))
      if (next) {
        used.add(next.id)
        picks.push(next.id)
      }
    }
  }
  return picks
}
