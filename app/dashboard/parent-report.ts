// Server-only helper (NOT a Server Action — no 'use server'). Assembles the
// read-only weekly parent report from the last 7 KST days. READ-ONLY: no writes.
// Reuses loadRecommendation (concept DAG + effectiveMastery) and delegates all
// math to the pure buildWeeklyParentReport (lib/growth). Review adherence is
// reported as counts only — historical due dates are not stored, so no rate.

import { createClient } from '@/lib/supabase/server'
import { loadRecommendation } from '@/app/learn/recommend'
import { GRAPH_DEFAULTS } from '@/lib/graph'
import {
  buildWeeklyParentReport,
  subDays,
  startOfTodayUtc,
  todayKst,
  type WeeklyParentReport,
} from '@/lib/growth'

interface SessionSummaryShape {
  mode?: string
  problemCount?: number
  sessionMasteryDelta?: number | null
  conceptDeltas?: { conceptId: string; delta: number }[]
}

export async function loadParentWeeklyReport(): Promise<WeeklyParentReport> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthorized')

  const { rec, effByConcept, dueConceptIds, nameById } = await loadRecommendation()

  const today = todayKst()
  const weekStart = subDays(today, 6)
  const startUtc = startOfTodayUtc(weekStart)

  const [{ data: sessions }, { data: attempts }] = await Promise.all([
    supabase
      .from('learning_sessions')
      .select('summary')
      .eq('user_id', user.id)
      .not('ended_at', 'is', null)
      .gte('ended_at', startUtc),
    supabase
      .from('attempts')
      .select('concept_id, correct')
      .eq('user_id', user.id)
      .gte('created_at', startUtc),
  ])

  // Completed practice sessions with attempts -> builder session shape.
  const completed = (sessions ?? [])
    .map((s) => (s.summary ?? {}) as SessionSummaryShape)
    .filter((sm) => (sm.mode ?? 'practice') === 'practice' && (sm.problemCount ?? 0) > 0)
    .map((sm) => ({
      sessionMasteryDelta: sm.sessionMasteryDelta ?? null,
      conceptDeltas: (sm.conceptDeltas ?? []).map((d) => ({ conceptId: d.conceptId, delta: d.delta })),
    }))

  // Recent wrong attempts + distinct concepts attempted (last 7 KST days).
  const wrongByConcept = new Map<string, number>()
  const reviewedSet = new Set<string>()
  for (const a of attempts ?? []) {
    if (!a.concept_id) continue
    reviewedSet.add(a.concept_id)
    if (a.correct === false) {
      wrongByConcept.set(a.concept_id, (wrongByConcept.get(a.concept_id) ?? 0) + 1)
    }
  }

  const T = GRAPH_DEFAULTS.masteryThreshold
  const dueSet = new Set(dueConceptIds)

  // Per-concept current state (effectiveMastery already computed by loadRecommendation).
  const mastery = Object.entries(effByConcept).map(([conceptId, eff]) => ({
    conceptId,
    effectiveMastery: eff,
    due: dueSet.has(conceptId),
    recentWrong: wrongByConcept.get(conceptId) ?? 0,
  }))

  const weakAsc = Object.entries(effByConcept)
    .filter(([id, eff]) => eff < T && rec.statuses[id] !== 'locked')
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)

  return buildWeeklyParentReport({
    weekStart,
    weekEnd: today,
    sessions: completed,
    mastery,
    attemptedThisWeek: reviewedSet.size,
    dueConceptIds,
    weakAsc,
    frontier: rec.frontier,
    nameById,
    threshold: T,
  })
}
