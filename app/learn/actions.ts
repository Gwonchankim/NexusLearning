'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { gradeAnswer, type AnswerType } from '@/lib/grading'
import { updateMastery, effectiveMastery, type Difficulty, type MasteryState } from '@/lib/adaptive'
import { summarizeSessionDeltas } from '@/lib/growth'
import { updateSchedule, SCHEDULER_DEFAULTS, type ReviewState } from '@/lib/scheduler'
import type { SessionMode } from '@/lib/session/select'
import { parseProblemIds, checkSubmission } from '@/lib/session/validate'
import { isStartable } from '@/lib/graph'
import { createSession } from './create-session'
import { loadRecommendation } from './recommend'
import { loadGrowth } from '@/app/dashboard/growth'

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthorized')
  return { supabase, user }
}

// ---- session entry points (explicit actions only; never during render) ----

export async function startPracticeSession() {
  const id = await createSession('practice')
  redirect(`/learn?sessionId=${id}`)
}

export async function startDiagnosticSession() {
  const id = await createSession('diagnostic')
  redirect(`/learn?sessionId=${id}`)
}

// Start a focused practice session for a frontier/fallback recommendation.
// The conceptId comes from the client, so the server recomputes the
// recommendation and rejects anything that isn't currently startable.
export async function startConceptSession(conceptId: string) {
  const { rec } = await loadRecommendation()
  if (!isStartable(rec, conceptId)) throw new Error('concept not startable')
  const source = rec.frontier.includes(conceptId) ? 'frontier' : 'fallback'
  const id = await createSession('practice', { focusConceptId: conceptId, source })
  redirect(`/learn?sessionId=${id}`)
}

// Start a focused session for a TODAY-QUEST item (new or review/weak). The
// quest review items aren't necessarily "startable" via the frontier-only
// isStartable check, so this validates membership in the recomputed quest.
export async function startQuestSession(conceptId: string) {
  const g = await loadGrowth()
  const item = g.quest.items.find((i) => i.conceptId === conceptId)
  if (!item) throw new Error('concept not in today quest')
  const source = item.kind === 'new' ? 'frontier' : 'fallback'
  const id = await createSession('practice', { focusConceptId: conceptId, source })
  redirect(`/learn?sessionId=${id}`)
}

// ---- attempt submission ----

export interface SubmitAttemptInput {
  sessionId: string
  problemId: string
  submittedAnswer: string
  timeMs?: number
}

export interface SubmitAttemptResult {
  correct: boolean
  solution: string | null
  wrongFeedback: string | null
  masteryBefore: number
  masteryAfter: number
  nextReviewAt: string | null
  normalizedSubmitted: string
}

export async function submitAttempt(input: SubmitAttemptInput): Promise<SubmitAttemptResult> {
  const { supabase, user } = await requireUser()
  const now = new Date()

  // Verify the session belongs to this user (and read its mode / problem set / end state).
  const { data: session } = await supabase
    .from('learning_sessions')
    .select('id, user_id, summary, ended_at')
    .eq('id', input.sessionId)
    .single()
  if (!session || session.user_id !== user.id) throw new Error('forbidden')

  const summary = (session.summary ?? {}) as { mode?: SessionMode; problemIds?: unknown }
  const problemIds = parseProblemIds(summary.problemIds)
  const mode: SessionMode = summary.mode === 'diagnostic' ? 'diagnostic' : 'practice'

  // Has this problem already been attempted in this session?
  const { data: existing } = await supabase
    .from('attempts')
    .select('id')
    .eq('session_id', input.sessionId)
    .eq('user_id', user.id)
    .eq('problem_id', input.problemId)
    .limit(1)

  // Server-side guards: session not ended, problem belongs to the session, no duplicate.
  const guard = checkSubmission({
    problemIds,
    problemId: input.problemId,
    sessionEnded: Boolean(session.ended_at),
    alreadyAttempted: Boolean(existing && existing.length > 0),
  })
  if (!guard.ok) throw new Error(`submission rejected: ${guard.reason}`)

  // Server-side fetch of the canonical answer (reviewed problems only).
  const { data: problem } = await supabase
    .from('problems')
    .select('id, concept_id, answer, answer_type, choices, difficulty, solution, wrong_feedback')
    .eq('id', input.problemId)
    .eq('reviewed', true)
    .single()
  if (!problem) throw new Error('problem not found')

  const grade = gradeAnswer({
    answerType: problem.answer_type as AnswerType,
    submitted: input.submittedAnswer,
    answer: problem.answer,
    choices: (problem.choices as string[] | null) ?? null,
  })

  // Record the attempt with the RAW submitted answer.
  const { error: attemptError } = await supabase.from('attempts').insert({
    session_id: input.sessionId,
    user_id: user.id,
    problem_id: problem.id,
    concept_id: problem.concept_id,
    correct: grade.correct,
    time_ms: input.timeMs ?? null,
    mode,
    submitted_answer: input.submittedAnswer,
  })
  if (attemptError) throw new Error(attemptError.message)

  // Load current mastery/schedule for the concept (defaults when absent).
  const { data: cm } = await supabase
    .from('concept_mastery')
    .select('mastery, attempts_count, last_reviewed_at, interval_days, ease, next_review_at')
    .eq('user_id', user.id)
    .eq('concept_id', problem.concept_id)
    .maybeSingle()

  const masteryState: MasteryState = {
    mastery: cm?.mastery ?? 0,
    attemptsCount: cm?.attempts_count ?? 0,
    lastReviewedAt: cm?.last_reviewed_at ?? null,
  }
  const reviewState: ReviewState = {
    intervalDays: cm?.interval_days ?? 0,
    ease: cm?.ease ?? SCHEDULER_DEFAULTS.defaultEase,
    lastReviewedAt: cm?.last_reviewed_at ?? null,
    nextReviewAt: cm?.next_review_at ?? null,
  }

  const masteryBefore = masteryState.mastery
  const nextMastery = updateMastery({
    current: masteryState,
    correct: grade.correct,
    difficulty: problem.difficulty as Difficulty,
    now,
  })
  const nextReview = updateSchedule({ current: reviewState, correct: grade.correct, now })

  const { error: masteryError } = await supabase.from('concept_mastery').upsert(
    {
      user_id: user.id,
      concept_id: problem.concept_id,
      mastery: nextMastery.mastery,
      attempts_count: nextMastery.attemptsCount,
      last_reviewed_at: nextMastery.lastReviewedAt,
      next_review_at: nextReview.nextReviewAt,
      interval_days: nextReview.intervalDays,
      ease: nextReview.ease,
    },
    { onConflict: 'user_id,concept_id' },
  )
  if (masteryError) throw new Error(masteryError.message)

  return {
    correct: grade.correct,
    solution: problem.solution ?? null,
    wrongFeedback: problem.wrong_feedback ?? null,
    masteryBefore,
    masteryAfter: nextMastery.mastery,
    nextReviewAt: nextReview.nextReviewAt,
    normalizedSubmitted: grade.normalizedSubmitted,
  }
}

// ---- end session (server recomputes the summary; never trusts the client) ----

export interface SessionSummary {
  mode: SessionMode
  problemIds: string[]
  problemCount: number
  correctCount: number
  durationMs: number | null
  conceptDeltas: { conceptId: string; name: string; before: number; after: number; delta: number }[]
  sessionMasteryDelta: number | null
  nextReviewAt: string | null
}

export async function endSession(sessionId: string): Promise<SessionSummary> {
  const { supabase, user } = await requireUser()

  const { data: session } = await supabase
    .from('learning_sessions')
    .select('id, user_id, summary, started_at')
    .eq('id', sessionId)
    .single()
  if (!session || session.user_id !== user.id) throw new Error('forbidden')

  const { data: attempts } = await supabase
    .from('attempts')
    .select('correct, concept_id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)

  const rows = attempts ?? []
  const problemCount = rows.length
  const correctCount = rows.filter((a) => a.correct).length
  const endedAt = new Date()
  const durationMs = session.started_at
    ? endedAt.getTime() - new Date(session.started_at).getTime()
    : null

  const prev = (session.summary ?? {}) as {
    mode?: SessionMode
    problemIds?: string[]
    startMastery?: Record<string, number>
  }

  // Distinct concepts actually attempted this session -> after mastery + names + earliest next review.
  const attemptedConcepts = [
    ...new Set(rows.map((a) => a.concept_id).filter((c): c is string => Boolean(c))),
  ]
  const afterMastery: Record<string, number> = {}
  const nameById: Record<string, string> = {}
  let nextReviewAt: string | null = null
  if (attemptedConcepts.length > 0) {
    const [{ data: cm }, { data: cs }] = await Promise.all([
      supabase
        .from('concept_mastery')
        .select('concept_id, mastery, last_reviewed_at, next_review_at')
        .eq('user_id', user.id)
        .in('concept_id', attemptedConcepts),
      supabase.from('concepts').select('id, name').in('id', attemptedConcepts),
    ])
    for (const m of cm ?? []) {
      afterMastery[m.concept_id] = effectiveMastery(
        { mastery: m.mastery, attemptsCount: 0, lastReviewedAt: m.last_reviewed_at },
        endedAt,
      )
      if (m.next_review_at && (nextReviewAt === null || m.next_review_at < nextReviewAt)) {
        nextReviewAt = m.next_review_at
      }
    }
    for (const c of cs ?? []) nameById[c.id] = c.name
  }

  const { conceptDeltas, sessionMasteryDelta } = summarizeSessionDeltas({
    conceptIds: attemptedConcepts,
    startMastery: prev.startMastery,
    afterMastery,
  })

  // Persist slug-only conceptDeltas (names are joined only for the UI return).
  const summary = {
    ...prev,
    problemCount,
    correctCount,
    durationMs,
    conceptDeltas,
    sessionMasteryDelta,
    nextReviewAt,
  }

  const { error } = await supabase
    .from('learning_sessions')
    .update({ ended_at: endedAt.toISOString(), summary })
    .eq('id', sessionId)
  if (error) throw new Error(error.message)

  return {
    mode: prev.mode ?? 'practice',
    problemIds: prev.problemIds ?? [],
    problemCount,
    correctCount,
    durationMs,
    conceptDeltas: conceptDeltas.map((d) => ({ ...d, name: nameById[d.conceptId] ?? d.conceptId })),
    sessionMasteryDelta,
    nextReviewAt,
  }
}
