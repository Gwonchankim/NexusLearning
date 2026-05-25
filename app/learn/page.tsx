import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LearnSession, { type LearnProblem } from './LearnSession'

// Next 16: searchParams is async.
export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>
}) {
  const { sessionId } = await searchParams
  if (!sessionId) redirect('/dashboard')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: session } = await supabase
    .from('learning_sessions')
    .select('id, user_id, summary, ended_at')
    .eq('id', sessionId)
    .single()
  if (!session || session.user_id !== user.id) redirect('/dashboard')

  const summary = (session.summary ?? {}) as {
    mode?: 'practice' | 'diagnostic'
    problemIds?: string[]
  }
  const problemIds = summary.problemIds ?? []
  const mode = summary.mode ?? 'practice'

  // Fetch problems WITHOUT answer/solution/wrong_feedback (payload protection).
  const { data: rows } = await supabase
    .from('problems')
    .select('id, concept_id, stem, choices, difficulty, answer_type')
    .in('id', problemIds.length ? problemIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('reviewed', true)

  const byId = new Map((rows ?? []).map((p) => [p.id, p]))
  const problems: LearnProblem[] = problemIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      id: p.id,
      concept_id: p.concept_id,
      stem: p.stem,
      choices: (p.choices as string[] | null) ?? null,
      difficulty: p.difficulty,
      answer_type: p.answer_type,
    }))

  // Existing attempts for this session -> resume (don't re-serve answered problems).
  const { data: attempts } = await supabase
    .from('attempts')
    .select('problem_id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
  const answeredProblemIds = (attempts ?? []).map((a) => a.problem_id)

  return (
    <LearnSession
      sessionId={sessionId}
      mode={mode}
      ended={Boolean(session.ended_at)}
      problems={problems}
      answeredProblemIds={answeredProblemIds}
    />
  )
}
