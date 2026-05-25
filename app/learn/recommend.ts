// Server-only helper (NOT a Server Action — no 'use server') shared by the
// dashboard render and the startConceptSession action. Fetches the concept DAG +
// the current user's mastery, derives per-concept signals, and runs lib/graph.

import { createClient } from '@/lib/supabase/server'
import { effectiveMastery } from '@/lib/adaptive'
import { recommend, type ConceptNode, type ConceptSignal, type Recommendation } from '@/lib/graph'

export interface DashboardRecommendation {
  hasProgress: boolean
  /** Average effective mastery over concepts the user has studied (not all 15). */
  avgEffectiveMastery: number
  dueCount: number
  concepts: { id: string; name: string; unitId: string; orderIndex: number; prereqIds: string[] }[]
  rec: Recommendation
  nameById: Record<string, string>
  effByConcept: Record<string, number> // only concepts the user has a mastery row for
}

export async function loadRecommendation(): Promise<DashboardRecommendation> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthorized')

  const [{ data: concepts }, { data: prereqs }, { data: mastery }] = await Promise.all([
    supabase.from('concepts').select('id, name, unit_id, order_index').order('order_index'),
    supabase.from('concept_prerequisites').select('concept_id, prereq_concept_id'),
    supabase
      .from('concept_mastery')
      .select('concept_id, mastery, last_reviewed_at, next_review_at')
      .eq('user_id', user.id),
  ])

  const now = new Date()
  const conceptRows = concepts ?? []
  const masteryRows = mastery ?? []

  const prereqsByConcept = new Map<string, string[]>()
  for (const p of prereqs ?? []) {
    const arr = prereqsByConcept.get(p.concept_id) ?? []
    arr.push(p.prereq_concept_id)
    prereqsByConcept.set(p.concept_id, arr)
  }

  const signalByConcept: Record<string, ConceptSignal> = {}
  for (const m of masteryRows) {
    signalByConcept[m.concept_id] = {
      effectiveMastery: effectiveMastery(
        { mastery: m.mastery, attemptsCount: 0, lastReviewedAt: m.last_reviewed_at },
        now,
      ),
      due: m.next_review_at != null && new Date(m.next_review_at) <= now,
    }
  }

  const nodes: ConceptNode[] = conceptRows.map((c) => ({
    id: c.id,
    unitId: c.unit_id,
    prereqIds: prereqsByConcept.get(c.id) ?? [],
    orderIndex: c.order_index,
  }))

  const rec = recommend({ concepts: nodes, signalByConcept })

  const studied = masteryRows.map((m) => signalByConcept[m.concept_id].effectiveMastery)
  const avgEffectiveMastery = studied.length
    ? studied.reduce((a, b) => a + b, 0) / studied.length
    : 0
  const dueCount = masteryRows.filter(
    (m) => m.next_review_at && new Date(m.next_review_at) <= now,
  ).length

  const nameById: Record<string, string> = {}
  for (const c of conceptRows) nameById[c.id] = c.name

  const effByConcept: Record<string, number> = {}
  for (const m of masteryRows) effByConcept[m.concept_id] = signalByConcept[m.concept_id].effectiveMastery

  return {
    hasProgress: masteryRows.length > 0,
    avgEffectiveMastery,
    dueCount,
    concepts: nodes.map((n) => ({
      id: n.id,
      name: nameById[n.id],
      unitId: n.unitId,
      orderIndex: n.orderIndex,
      prereqIds: n.prereqIds,
    })),
    rec,
    nameById,
    effByConcept,
  }
}
