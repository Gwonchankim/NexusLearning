'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const DIFFICULTIES = ['easy', 'medium', 'hard']
const ANSWER_TYPES = ['multiple_choice', 'short_answer', 'expression']

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthorized')
  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (!isAdmin) throw new Error('forbidden')
  return { supabase, user }
}

function emptyToNull(v: FormDataEntryValue | null) {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

// Approve = save any edits + mark reviewed. Approval is also enforced by the
// problems_admin_update RLS policy at the DB level.
export async function approveProblem(formData: FormData) {
  const { supabase, user } = await requireAdmin()

  const id = String(formData.get('id'))
  const difficulty = String(formData.get('difficulty'))
  const answerType = String(formData.get('answer_type'))

  const patch = {
    concept_id: String(formData.get('concept_id')),
    stem: String(formData.get('stem')),
    answer: String(formData.get('answer')),
    solution: emptyToNull(formData.get('solution')),
    wrong_feedback: emptyToNull(formData.get('wrong_feedback')),
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'medium',
    answer_type: ANSWER_TYPES.includes(answerType) ? answerType : 'multiple_choice',
    reviewed: true,
    reviewer_id: user.id,
    reviewed_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('problems').update(patch).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/review')
  revalidatePath('/admin')
}

// Reject = delete the draft (MVP), enforced by problems_admin_delete RLS.
export async function rejectProblem(formData: FormData) {
  const { supabase } = await requireAdmin()

  const id = String(formData.get('id'))
  const { error } = await supabase.from('problems').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/review')
  revalidatePath('/admin')
}
