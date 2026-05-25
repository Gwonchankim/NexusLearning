// Server-only helper (NOT a Server Action — no 'use server') shared by the
// practice (dashboard) and diagnostic (onboarding) entry points. Creating a
// session is an explicit, deliberate write — never done during page render.

import { createClient } from '@/lib/supabase/server'
import { selectSessionProblems, type SessionMode } from '@/lib/session/select'
import { effectiveMastery } from '@/lib/adaptive'

export interface CreateSessionOptions {
  focusConceptId?: string // restrict the session to a single concept (frontier/fallback)
  source?: 'frontier' | 'fallback'
}

/** Create a learning session for the current user and return its id. */
export async function createSession(
  mode: SessionMode,
  opts?: CreateSessionOptions,
): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthorized')

  const [{ data: concepts }, { data: problems }, { data: progress }] = await Promise.all([
    supabase.from('concepts').select('id, order_index'),
    supabase.from('problems_public').select('id, concept_id, difficulty'),
    supabase
      .from('concept_mastery')
      .select('concept_id, mastery, last_reviewed_at, next_review_at')
      .eq('user_id', user.id),
  ])

  const problemIds = selectSessionProblems({
    mode,
    focusConceptId: opts?.focusConceptId,
    concepts: (concepts ?? []).map((c) => ({ id: c.id, orderIndex: c.order_index })),
    reviewedProblems: (problems ?? []).map((p) => ({
      id: p.id,
      conceptId: p.concept_id,
      difficulty: p.difficulty,
    })),
    progress: (progress ?? []).map((p) => ({
      conceptId: p.concept_id,
      mastery: p.mastery,
      lastReviewedAt: p.last_reviewed_at,
      nextReviewAt: p.next_review_at,
    })),
  })

  // Never create an empty session (focus OR general) — guards against a dead
  // /learn?sessionId with no problems.
  if (problemIds.length === 0) {
    throw new Error(
      opts?.focusConceptId ? 'no reviewed problems for concept' : 'no problems available for session',
    )
  }

  // startMastery snapshot: effectiveMastery at session start for the session's
  // distinct concepts (focus -> the focus concept; general -> the picked problems').
  const conceptById = new Map((problems ?? []).map((p) => [p.id as string, p.concept_id as string]))
  const progressByConcept = new Map(
    (progress ?? []).map((p) => [
      p.concept_id as string,
      { mastery: p.mastery as number, lastReviewedAt: (p.last_reviewed_at as string | null) ?? null },
    ]),
  )
  const sessionConceptIds = opts?.focusConceptId
    ? [opts.focusConceptId]
    : [...new Set(problemIds.map((id) => conceptById.get(id)).filter((c): c is string => Boolean(c)))]

  const now = new Date()
  const startMastery: Record<string, number> = {}
  for (const c of sessionConceptIds) {
    const pr = progressByConcept.get(c)
    startMastery[c] = pr
      ? effectiveMastery({ mastery: pr.mastery, attemptsCount: 0, lastReviewedAt: pr.lastReviewedAt }, now)
      : 0
  }

  const summary = {
    mode,
    problemIds,
    ...(opts?.focusConceptId ? { focusConceptId: opts.focusConceptId, source: opts.source } : {}),
    startMastery,
  }

  const { data: session, error } = await supabase
    .from('learning_sessions')
    .insert({ user_id: user.id, summary })
    .select('id')
    .single()

  if (error || !session) throw new Error(error?.message ?? 'failed to create session')
  return session.id as string
}
