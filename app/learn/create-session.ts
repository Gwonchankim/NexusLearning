// Server-only helper (NOT a Server Action — no 'use server') shared by the
// practice (dashboard) and diagnostic (onboarding) entry points. Creating a
// session is an explicit, deliberate write — never done during page render.

import { createClient } from '@/lib/supabase/server'
import { selectSessionProblems, type SessionMode } from '@/lib/session/select'

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
    supabase.from('problems').select('id, concept_id, difficulty').eq('reviewed', true),
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

  // Don't create an empty focused session if the concept has no reviewed problems.
  if (opts?.focusConceptId && problemIds.length === 0) {
    throw new Error('no reviewed problems for concept')
  }

  const summary = opts?.focusConceptId
    ? { mode, problemIds, focusConceptId: opts.focusConceptId, source: opts.source }
    : { mode, problemIds }

  const { data: session, error } = await supabase
    .from('learning_sessions')
    .insert({ user_id: user.id, summary })
    .select('id')
    .single()

  if (error || !session) throw new Error(error?.message ?? 'failed to create session')
  return session.id as string
}
