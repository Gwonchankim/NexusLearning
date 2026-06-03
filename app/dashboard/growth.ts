// Server-only helper (NOT a Server Action) shared by the dashboard render and
// the startQuestSession action. Assembles DashboardGrowth from learning_sessions
// / attempts + the PR4 recommendation. Dates are KST.

import { createClient } from '@/lib/supabase/server'
import { loadRecommendation } from '@/app/learn/recommend'
import { GRAPH_DEFAULTS } from '@/lib/graph'
import {
  computeStreak,
  buildTodayQuest,
  kstDate,
  todayKst,
  startOfTodayUtc,
  subDays,
  collapseDailyMastery,
  type DashboardGrowth,
} from '@/lib/growth'

export async function loadGrowth(): Promise<DashboardGrowth> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthorized')

  const { rec, effByConcept, dueConceptIds, nameById } = await loadRecommendation()

  const today = todayKst()
  const startUtc = startOfTodayUtc(today)

  const [{ data: sessions }, { data: todayAttempts }, { data: snapshots }] = await Promise.all([
    supabase
      .from('learning_sessions')
      .select('ended_at, summary')
      .eq('user_id', user.id)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false }),
    supabase.from('attempts').select('concept_id').eq('user_id', user.id).gte('created_at', startUtc),
    supabase
      .from('growth_snapshots')
      .select('date, mastery_avg')
      .eq('user_id', user.id)
      .gte('date', subDays(today, 29))
      .order('date', { ascending: true }),
  ])

  const completed = sessions ?? []
  // 보정2: null/missing sessionMasteryDelta는 0으로 취급.
  const delta = (s: { summary?: { sessionMasteryDelta?: number | null } }) =>
    (s.summary?.sessionMasteryDelta ?? 0) as number

  const completedDates = [...new Set(completed.map((s) => kstDate(new Date(s.ended_at))))]
  const streak = computeStreak(completedDates, today)

  const recent = completed
    .slice(0, 7)
    .reverse()
    .map((s) => ({ date: kstDate(new Date(s.ended_at)), delta: delta(s) }))

  const todayDelta = completed
    .filter((s) => kstDate(new Date(s.ended_at)) === today)
    .reduce((sum, s) => sum + delta(s), 0)

  const todayConceptIds = [
    ...new Set((todayAttempts ?? []).map((a) => a.concept_id).filter((c): c is string => Boolean(c))),
  ]

  const T = GRAPH_DEFAULTS.masteryThreshold
  const locked = Object.entries(rec.statuses)
    .filter(([, s]) => s === 'locked')
    .map(([id]) => id)
  const weakAsc = Object.entries(effByConcept)
    .filter(([id, eff]) => eff < T && rec.statuses[id] !== 'locked')
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)

  const quest = buildTodayQuest({
    frontier: rec.frontier,
    due: dueConceptIds,
    weakAsc,
    locked,
    todayConceptIds,
  })

  const curve = collapseDailyMastery(
    (snapshots ?? []).map((s) => ({ date: s.date, masteryAvg: s.mastery_avg })),
  )

  return { todayDelta, streak, quest, recent, curve, nameById }
}
