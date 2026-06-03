// Server-only helper (NOT a Server Action — no 'use server'). Assembles the
// read-only diagnostic-based initial parent report from the user's most recent
// completed diagnostic session. READ-ONLY: no writes. Reuses loadRecommendation
// (concept DAG + effectiveMastery) and delegates all math to the pure
// buildDiagnosticSampleReport (lib/growth). CTA/plan targets are restricted to
// concepts that are startable (isStartable) AND have reviewed problems.

import { createClient } from '@/lib/supabase/server'
import { loadRecommendation } from '@/app/learn/recommend'
import { isStartable, GRAPH_DEFAULTS } from '@/lib/graph'
import {
  buildDiagnosticSampleReport,
  kstDate,
  type DiagnosticParentSampleReport,
} from '@/lib/growth'

export async function loadDiagnosticSampleReport(): Promise<DiagnosticParentSampleReport> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthorized')

  const { rec, effByConcept, nameById, concepts } = await loadRecommendation()

  // Most recent ENDED diagnostic session (summary.mode === 'diagnostic').
  const { data: sessions } = await supabase
    .from('learning_sessions')
    .select('id, ended_at, summary')
    .eq('user_id', user.id)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
  const diag = (sessions ?? []).find(
    (s) => (s.summary as { mode?: string } | null)?.mode === 'diagnostic',
  )

  let attempts: { conceptId: string; correct: boolean }[] = []
  let diagnosticDate: string | null = null
  if (diag) {
    diagnosticDate = kstDate(new Date(diag.ended_at))
    const { data: rows } = await supabase
      .from('attempts')
      .select('concept_id, correct')
      .eq('user_id', user.id)
      .eq('session_id', diag.id)
    attempts = (rows ?? [])
      .filter((r): r is { concept_id: string; correct: boolean } => Boolean(r.concept_id))
      .map((r) => ({ conceptId: r.concept_id, correct: r.correct }))
  }

  // Concepts that have at least one reviewed problem (so a session is startable).
  const { data: probs } = await supabase.from('problems_public').select('concept_id')
  const conceptsWithProblems = [
    ...new Set((probs ?? []).map((p) => p.concept_id as string).filter(Boolean)),
  ]

  // blocksDownstream: how many concepts list X as a prerequisite.
  const blocksDownstreamById: Record<string, number> = {}
  for (const c of concepts) {
    for (const p of c.prereqIds) blocksDownstreamById[p] = (blocksDownstreamById[p] ?? 0) + 1
  }

  const T = GRAPH_DEFAULTS.masteryThreshold
  const startableIds = concepts.map((c) => c.id).filter((id) => isStartable(rec, id))
  const weakAsc = Object.entries(effByConcept)
    .filter(([id, eff]) => eff < T && rec.statuses[id] !== 'locked')
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)

  return buildDiagnosticSampleReport({
    diagnosticDate,
    hasDiagnostic: Boolean(diag),
    attempts,
    effByConcept,
    blocksDownstreamById,
    startableIds,
    conceptsWithProblems,
    weakAsc,
    frontier: rec.frontier,
    nameById,
    threshold: T,
  })
}
