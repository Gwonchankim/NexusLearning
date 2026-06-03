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

/**
 * Append the correct Korean particle to a word by its final-consonant (받침).
 * `withBatchim` is used when the last Hangul syllable has a final consonant
 * (e.g. 이/은/을), `withoutBatchim` otherwise (가/는/를). Non-Hangul endings
 * fall back to `withoutBatchim`.
 */
export function withJosa(word: string, withBatchim: string, withoutBatchim: string): string {
  const code = word.charCodeAt(word.length - 1)
  const isHangulSyllable = code >= 0xac00 && code <= 0xd7a3
  const hasBatchim = isHangulSyllable && (code - 0xac00) % 28 !== 0
  return word + (hasBatchim ? withBatchim : withoutBatchim)
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

// ---------- weekly parent report (read-only, B2C) ----------
// Pure builder for the parent-facing weekly report. The server loader
// (app/dashboard/parent-report.ts) fetches rows + computes effectiveMastery,
// then hands plain data here. Sentence-first, no exaggeration: we describe
// stability/attention, never claim score gains. Data-sparse weeks degrade to a
// cautious `state` instead of confident claims.

export type ReportState = 'empty' | 'sparse' | 'ok'

export interface ReportConceptChange {
  conceptId: string
  name: string
  delta: number // cumulative positive mastery change over the week (0..1)
  sessions: number // sessions that contributed
}

export interface ReportRiskConcept {
  conceptId: string
  name: string
  effectiveMastery: number // 0..1 (forgetting decay applied)
  due: boolean
  recentWrong: number // wrong attempts in the last 7 days
}

export interface ReportActionItem {
  kind: 'review' | 'prereq' | 'frontier'
  conceptId: string
  name: string
  reason: string // parent-facing sentence
}

export interface WeeklyReportInput {
  weekStart: string // KST "YYYY-MM-DD" (inclusive)
  weekEnd: string // KST "YYYY-MM-DD" (today)
  // completed practice sessions ended within the week (already filtered by the loader)
  sessions: { sessionMasteryDelta: number | null; conceptDeltas: { conceptId: string; delta: number }[] }[]
  // current per-concept state (effectiveMastery already computed by the loader)
  mastery: { conceptId: string; effectiveMastery: number; due: boolean; recentWrong: number }[]
  attemptedThisWeek: number // distinct concepts attempted in the last 7 days (count only — no rate)
  // recommendation pools for the action plan (from loadRecommendation)
  dueConceptIds: string[]
  weakAsc: string[] // non-locked, below-threshold concepts, weakest first
  frontier: string[]
  nameById: Record<string, string>
  threshold: number // mastery threshold (e.g. 0.7)
}

export interface WeeklyParentReport {
  weekStart: string
  weekEnd: string
  completedSessions: number // practice sessions with attempts, last 7 KST days
  weeklyMasteryDelta: number | null // Σ sessionMasteryDelta (null if every session lacked a delta)
  topGrowth: ReportConceptChange[] // up to 3
  riskConcepts: ReportRiskConcept[] // up to 3
  reviewAdherence: { overdueNow: number; attemptedThisWeek: number } // counts only — no rate (no historical due data)
  actions: ReportActionItem[] // up to 3
  conclusion: string // rule-based, hedged (no AI)
  state: ReportState
}

const nameOf = (id: string, nameById: Record<string, string>) => nameById[id] ?? id

function topGrowthConcepts(
  sessions: WeeklyReportInput['sessions'],
  nameById: Record<string, string>,
  n: number,
): ReportConceptChange[] {
  const order: string[] = []
  const acc = new Map<string, { delta: number; sessions: number }>()
  for (const s of sessions) {
    for (const d of s.conceptDeltas) {
      if (!acc.has(d.conceptId)) order.push(d.conceptId)
      const a = acc.get(d.conceptId) ?? { delta: 0, sessions: 0 }
      a.delta += d.delta
      a.sessions += 1
      acc.set(d.conceptId, a)
    }
  }
  // stable sort keeps first-seen order on ties
  return order
    .map((id) => {
      const a = acc.get(id)!
      return { conceptId: id, name: nameOf(id, nameById), delta: a.delta, sessions: a.sessions }
    })
    .filter((c) => c.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, n)
}

function rankRiskConcepts(
  mastery: WeeklyReportInput['mastery'],
  nameById: Record<string, string>,
  threshold: number,
  n: number,
): ReportRiskConcept[] {
  return mastery
    .filter((m) => m.effectiveMastery < threshold && (m.due || m.recentWrong > 0))
    .sort((a, b) => a.effectiveMastery - b.effectiveMastery)
    .slice(0, n)
    .map((m) => ({
      conceptId: m.conceptId,
      name: nameOf(m.conceptId, nameById),
      effectiveMastery: m.effectiveMastery,
      due: m.due,
      recentWrong: m.recentWrong,
    }))
}

function planActions(input: WeeklyReportInput, n: number): ReportActionItem[] {
  const out: ReportActionItem[] = []
  const seen = new Set<string>()
  const push = (kind: ReportActionItem['kind'], id: string, reason: string) => {
    if (seen.has(id) || out.length >= n) return
    seen.add(id)
    out.push({ kind, conceptId: id, name: nameOf(id, input.nameById), reason })
  }
  // priority: overdue review -> weak prerequisite -> frontier
  for (const id of input.dueConceptIds) {
    push('review', id, '복습 시점이 지난 개념이에요. 먼저 복습하면 약해진 부분을 회복할 수 있어요.')
  }
  for (const id of input.weakAsc) {
    push('prereq', id, '다음 단계의 토대가 되는 개념이에요. 먼저 다지면 이후 학습이 수월해져요.')
  }
  for (const id of input.frontier) {
    push('frontier', id, '준비가 된 다음 개념이에요. 새로 배우기 좋은 시점이에요.')
  }
  return out.slice(0, n)
}

function weeklyConclusion(
  state: ReportState,
  topGrowth: ReportConceptChange[],
  riskConcepts: ReportRiskConcept[],
): string {
  if (state === 'empty') {
    return '이번 주 학습 기록이 아직 없어요. 오늘의 학습으로 한 주를 시작해 보세요.'
  }
  if (state === 'sparse') {
    if (riskConcepts.length > 0) {
      return `아직 이번 주 성장을 판단할 데이터가 부족해요. 다만 ${withJosa(riskConcepts[0].name, '은', '는')} 한 번 더 점검이 필요해 보여요.`
    }
    return '아직 판단할 데이터가 부족합니다. 며칠 더 학습하면 주간 변화를 보여드릴게요.'
  }
  const grew = `이번 주는 ${withJosa(topGrowth[0].name, '이', '가')} 안정됐어요.`
  const risk =
    riskConcepts.length > 0
      ? ` 다만 ${withJosa(riskConcepts[0].name, '은', '는')} 아직 흔들리고 있어 다음 주 복습이 필요해요.`
      : ' 전반적으로 기반이 탄탄해지고 있어요.'
  return grew + risk
}

export function buildWeeklyParentReport(input: WeeklyReportInput): WeeklyParentReport {
  const completedSessions = input.sessions.length
  const deltas = input.sessions
    .map((s) => s.sessionMasteryDelta)
    .filter((d): d is number => d != null)
  const weeklyMasteryDelta = deltas.length === 0 ? null : deltas.reduce((s, d) => s + d, 0)

  const topGrowth = topGrowthConcepts(input.sessions, input.nameById, 3)
  const riskConcepts = rankRiskConcepts(input.mastery, input.nameById, input.threshold, 3)
  const reviewAdherence = {
    overdueNow: input.mastery.filter((m) => m.due).length,
    attemptedThisWeek: input.attemptedThisWeek,
  }
  const actions = planActions(input, 3)

  let state: ReportState
  if (completedSessions === 0 && input.mastery.length === 0) state = 'empty'
  else if (completedSessions === 0 || topGrowth.length === 0) state = 'sparse'
  else state = 'ok'

  return {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    completedSessions,
    weeklyMasteryDelta,
    topGrowth,
    riskConcepts,
    reviewAdherence,
    actions,
    conclusion: weeklyConclusion(state, topGrowth, riskConcepts),
    state,
  }
}

// ---------- diagnostic sample report (free, post-onboarding; B2C) ----------
// Pure builder for the diagnostic-based initial report shown on /dashboard first
// entry, before a week of data exists. Sentence-first, hedged ("초기 진단 기준",
// "흔들려 보여요"), never claims score/grade gains. CTA + recovery plan target
// only concepts that are startable AND have problems, so the reused server action
// (startConceptSession) never breaks on a locked or problem-less concept.

export type DiagnosticReportState = 'empty' | 'sparse' | 'ok'

export interface DiagnosticRiskConcept {
  conceptId: string
  name: string
  effectiveMastery: number // 0..1
  wrongInDiagnostic: boolean // got it wrong in the diagnostic session
  blocksDownstream: number // how many concepts list this as a prerequisite
}

export interface DiagnosticRecoveryAction {
  conceptId: string
  name: string
  kind: 'review' | 'prereq' | 'frontier'
  reason: string // parent-facing sentence
}

export interface RecoveryPlanDay {
  bucket: 'day1_2' | 'day3_5' | 'day6_7'
  label: string
  focus: string
  concepts: { conceptId: string; name: string }[] // problem-backed only
}

export interface DiagnosticReportInput {
  diagnosticDate: string | null // KST date of the diagnostic session
  hasDiagnostic: boolean
  attempts: { conceptId: string; correct: boolean }[] // from the diagnostic session
  effByConcept: Record<string, number> // current effective mastery (attempted concepts)
  blocksDownstreamById: Record<string, number>
  startableIds: string[] // concepts that pass isStartable (frontier ∪ recommended)
  conceptsWithProblems: string[] // concepts that have at least one reviewed problem
  weakAsc: string[] // non-locked, below-threshold concepts, weakest first
  frontier: string[]
  nameById: Record<string, string>
  threshold: number
}

export interface DiagnosticParentSampleReport {
  state: DiagnosticReportState
  diagnosticDate: string | null
  riskConcepts: DiagnosticRiskConcept[] // up to 3
  recoveryPlan: RecoveryPlanDay[] // 3 buckets
  todayAction: DiagnosticRecoveryAction | null
  conclusion: string // rule-based, hedged, contains "초기 진단 기준"
}

function diagnosticConclusion(
  state: DiagnosticReportState,
  riskConcepts: DiagnosticRiskConcept[],
): string {
  if (state === 'empty') {
    return '초기 진단 기준: 아직 진단 데이터가 없어요. 미니 진단을 먼저 해볼까요?'
  }
  if (state === 'sparse') {
    return '초기 진단 기준: 아직 또렷한 신호는 보이지 않아요. 학습을 이어가면 더 정확해져요.'
  }
  return `초기 진단 기준: ${withJosa(riskConcepts[0].name, '이', '가')} 조금 흔들려 보여요. 아래 7일 플랜으로 시작해 보세요.`
}

export function buildDiagnosticSampleReport(
  input: DiagnosticReportInput,
): DiagnosticParentSampleReport {
  const { effByConcept, blocksDownstreamById, nameById, threshold } = input
  const startable = new Set(input.startableIds)
  const withProblems = new Set(input.conceptsWithProblems)

  const wrong = new Set<string>()
  const attempted = new Set<string>()
  for (const a of input.attempts) {
    attempted.add(a.conceptId)
    if (!a.correct) wrong.add(a.conceptId)
  }

  // Risk pool: attempted concepts that were wrong OR are below threshold.
  const riskConcepts: DiagnosticRiskConcept[] = [...attempted]
    .filter((id) => wrong.has(id) || (effByConcept[id] ?? 0) < threshold)
    .map((id) => ({
      conceptId: id,
      name: nameOf(id, nameById),
      effectiveMastery: effByConcept[id] ?? 0,
      wrongInDiagnostic: wrong.has(id),
      blocksDownstream: blocksDownstreamById[id] ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(b.wrongInDiagnostic) - Number(a.wrongInDiagnostic) || // ① wrong first
        a.effectiveMastery - b.effectiveMastery || // ② weakest mastery first
        b.blocksDownstream - a.blocksDownstream, // ③ blocks more downstream first
    )
    .slice(0, 3)

  const riskIds = new Set(riskConcepts.map((r) => r.conceptId))
  const playable = (id: string) => withProblems.has(id)
  const toC = (id: string) => ({ conceptId: id, name: nameOf(id, nameById) })

  // Recovery plan — only problem-backed concepts (so a session is actually startable).
  const day12 = input.weakAsc.filter((id) => startable.has(id) && playable(id) && !riskIds.has(id)).slice(0, 2)
  const day35 = riskConcepts.map((r) => r.conceptId).filter(playable).slice(0, 3)
  const recoveryPlan: RecoveryPlanDay[] = [
    { bucket: 'day1_2', label: 'Day 1–2', focus: '가장 약한 기초 개념부터 다져요.', concepts: day12.map(toC) },
    { bucket: 'day3_5', label: 'Day 3–5', focus: '진단에서 흔들린 개념을 직접 풀어봐요.', concepts: day35.map(toC) },
    { bucket: 'day6_7', label: 'Day 6–7', focus: '다시 점검하며 복습해요.', concepts: day35.map(toC) },
  ]

  // Today action: first concept that is BOTH startable and problem-backed,
  // scanning risk → weak prereq → frontier. Guarantees startConceptSession won't
  // reject (isStartable) or throw (no problems).
  const candidates: { id: string; kind: DiagnosticRecoveryAction['kind']; reason: string }[] = [
    ...riskConcepts.map((r) => ({
      id: r.conceptId,
      kind: 'review' as const,
      reason: '진단에서 흔들린 개념이에요. 오늘 바로 복습해 보세요.',
    })),
    ...input.weakAsc.map((id) => ({
      id,
      kind: 'prereq' as const,
      reason: '다음 단계의 토대가 되는 개념이에요. 먼저 다지면 이후 학습이 수월해져요.',
    })),
    ...input.frontier.map((id) => ({
      id,
      kind: 'frontier' as const,
      reason: '준비가 된 다음 개념이에요. 새로 시작하기 좋은 시점이에요.',
    })),
  ]
  let todayAction: DiagnosticRecoveryAction | null = null
  for (const c of candidates) {
    if (startable.has(c.id) && playable(c.id)) {
      todayAction = { conceptId: c.id, name: nameOf(c.id, nameById), kind: c.kind, reason: c.reason }
      break
    }
  }

  let state: DiagnosticReportState
  if (!input.hasDiagnostic && attempted.size === 0) state = 'empty'
  else if (riskConcepts.length === 0) state = 'sparse'
  else state = 'ok'

  return {
    state,
    diagnosticDate: input.diagnosticDate,
    riskConcepts,
    recoveryPlan,
    todayAction,
    conclusion: diagnosticConclusion(state, riskConcepts),
  }
}
