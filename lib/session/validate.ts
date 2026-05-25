// Pure server-side submission guards (PR3 blocking fix). No Supabase/Next imports.
// The server action gathers the facts (session.summary.problemIds, ended_at,
// whether an attempt already exists) and asks these helpers to decide.

/** Safely parse a session's summary.problemIds (jsonb) into a string[]. */
export function parseProblemIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
}

export type SubmissionRejection = 'session_ended' | 'not_in_session' | 'duplicate'

export interface SubmissionCheckInput {
  problemIds: string[]
  problemId: string
  sessionEnded: boolean
  alreadyAttempted: boolean
}

export type SubmissionCheck = { ok: true } | { ok: false; reason: SubmissionRejection }

/** Decide whether a submission for `problemId` is allowed in this session. */
export function checkSubmission(input: SubmissionCheckInput): SubmissionCheck {
  if (input.sessionEnded) return { ok: false, reason: 'session_ended' }
  if (!input.problemIds.includes(input.problemId)) return { ok: false, reason: 'not_in_session' }
  if (input.alreadyAttempted) return { ok: false, reason: 'duplicate' }
  return { ok: true }
}
