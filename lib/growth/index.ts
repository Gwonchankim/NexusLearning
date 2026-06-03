// Pure growth helpers (PR5). No Supabase/Next imports — unit tested.
// KST date boundary (Asia/Seoul = UTC+9, no DST), streak, today quest, and
// per-session mastery delta. Mastery is on a 0..1 scale (matches lib/adaptive).

export const KST_OFFSET_MS = 9 * 3_600_000

/** "YYYY-MM-DD" calendar date in KST for the given instant. */
export function kstDate(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

export function todayKst(now: Date = new Date()): string {
  return kstDate(now)
}

/** Previous calendar day for a "YYYY-MM-DD" string. */
export function prevDate(ymd: string): string {
  return new Date(new Date(`${ymd}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10)
}

/** N calendar days before a "YYYY-MM-DD" string (KST date arithmetic). */
export function subDays(ymd: string, n: number): string {
  return new Date(new Date(`${ymd}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10)
}

/** UTC ISO instant of KST midnight for `today` — use as a `gte` filter for "today (KST)". */
export function startOfTodayUtc(today: string = todayKst()): string {
  return new Date(`${today}T00:00:00+09:00`).toISOString()
}

/** Percentage points: 0..1 fraction → integer %. */
export function pp(x: number): number {
  return Math.round(x * 100)
}

// ---------- session mastery delta ----------

export interface ConceptDelta {
  conceptId: string
  before: number
  after: number
  delta: number
}

export interface SummarizeInput {
  conceptIds: string[]
  startMastery: Record<string, number> | undefined | null
  afterMastery: Record<string, number>
}

/**
 * Signed per-concept delta (after - before) over the concepts attempted this
 * session, and their mean. Returns null delta when there's nothing to compare
 * (no attempts, or no startMastery snapshot) so the UI can stay neutral.
 */
export function summarizeSessionDeltas(input: SummarizeInput): {
  conceptDeltas: ConceptDelta[]
  sessionMasteryDelta: number | null
} {
  const { conceptIds, startMastery, afterMastery } = input
  if (conceptIds.length === 0 || startMastery == null) {
    return { conceptDeltas: [], sessionMasteryDelta: null }
  }
  const conceptDeltas = conceptIds.map((c) => {
    const before = startMastery[c] ?? 0
    const after = afterMastery[c] ?? 0
    return { conceptId: c, before, after, delta: after - before }
  })
  const sessionMasteryDelta =
    conceptDeltas.reduce((sum, d) => sum + d.delta, 0) / conceptDeltas.length
  return { conceptDeltas, sessionMasteryDelta }
}

// ---------- today quest ----------

export type QuestKind = 'new' | 'review'
export interface QuestItem {
  conceptId: string
  kind: QuestKind
  done: boolean
}
export interface TodayQuest {
  items: QuestItem[]
  newDone: number
  newTotal: number
  reviewDone: number
  reviewTotal: number
}

export interface BuildQuestInput {
  frontier: string[] // new candidates (rec.frontier, never locked)
  due: string[] // review-due concept ids
  weakAsc: string[] // non-locked, below-threshold concepts, eff asc (fills review)
  locked: string[] // exclude defensively
  todayConceptIds: string[] // distinct concepts attempted today (KST) -> done
  targets?: { new: number; review: number }
}

export function buildTodayQuest(input: BuildQuestInput): TodayQuest {
  const targets = input.targets ?? { new: 2, review: 3 }
  const lockedSet = new Set(input.locked)
  const notLocked = (id: string) => !lockedSet.has(id)

  const newItems = input.frontier.filter(notLocked).slice(0, targets.new)
  const newSet = new Set(newItems)

  const reviewBase = input.due.filter((id) => notLocked(id) && !newSet.has(id))
  const reviewSet = new Set(reviewBase)
  const filler = input.weakAsc.filter(
    (id) => notLocked(id) && !newSet.has(id) && !reviewSet.has(id),
  )
  const reviewItems = [...reviewBase, ...filler].slice(0, targets.review)

  const todaySet = new Set(input.todayConceptIds)
  const items: QuestItem[] = [
    ...newItems.map((conceptId): QuestItem => ({ conceptId, kind: 'new', done: todaySet.has(conceptId) })),
    ...reviewItems.map((conceptId): QuestItem => ({ conceptId, kind: 'review', done: todaySet.has(conceptId) })),
  ]
  return {
    items,
    newTotal: newItems.length,
    newDone: newItems.filter((c) => todaySet.has(c)).length,
    reviewTotal: reviewItems.length,
    reviewDone: reviewItems.filter((c) => todaySet.has(c)).length,
  }
}

// ---------- streak ----------

export interface StreakInfo {
  current: number
  todayDone: boolean
}

export function computeStreak(
  completedKstDates: string[],
  today: string = todayKst(),
): StreakInfo {
  const set = new Set(completedKstDates)
  const todayDone = set.has(today)
  const yesterday = prevDate(today)
  let cursor: string | null = todayDone ? today : set.has(yesterday) ? yesterday : null
  if (cursor == null) return { current: 0, todayDone }
  let current = 0
  while (set.has(cursor)) {
    current++
    cursor = prevDate(cursor)
  }
  return { current, todayDone }
}

// ---------- growth snapshots (daily persistence + long-term curve) ----------

/**
 * Average mastery per unit. Used at session end to build per-unit growth_snapshots
 * rows from { unitId, mastery } pairs (mastery already effective, 0..1). Empty -> [].
 */
export function aggregateUnitMastery(
  rows: { unitId: string; mastery: number }[],
): { unitId: string; masteryAvg: number }[] {
  const byUnit = new Map<string, { sum: number; count: number }>()
  for (const r of rows) {
    const acc = byUnit.get(r.unitId) ?? { sum: 0, count: 0 }
    acc.sum += r.mastery
    acc.count += 1
    byUnit.set(r.unitId, acc)
  }
  return [...byUnit.entries()].map(([unitId, { sum, count }]) => ({
    unitId,
    masteryAvg: sum / count,
  }))
}

/**
 * Collapse per-unit daily snapshot rows into one point per date (mean across units),
 * sorted by date ascending. Drives the dashboard long-term curve. Empty -> [].
 */
export function collapseDailyMastery(
  rows: { date: string; masteryAvg: number }[],
): { date: string; masteryAvg: number }[] {
  const byDate = new Map<string, { sum: number; count: number }>()
  for (const r of rows) {
    const acc = byDate.get(r.date) ?? { sum: 0, count: 0 }
    acc.sum += r.masteryAvg
    acc.count += 1
    byDate.set(r.date, acc)
  }
  return [...byDate.entries()]
    .map(([date, { sum, count }]) => ({ date, masteryAvg: sum / count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ---------- dashboard growth shape ----------

export interface DashboardGrowth {
  todayDelta: number // sum of today's (KST) completed-session deltas (0..1)
  streak: StreakInfo
  quest: TodayQuest
  recent: { date: string; delta: number }[] // last 7 completed sessions, chronological
  curve: { date: string; masteryAvg: number }[] // last 30 days, one point/date, date asc
  nameById: Record<string, string>
}
