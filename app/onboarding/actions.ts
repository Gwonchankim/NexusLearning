'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createSession } from '@/app/learn/create-session'

/**
 * Onboarding form action: save grade/goal, then start the diagnostic session and
 * redirect into /learn. The profiles row already exists (0003 trigger), so update.
 */
export async function saveProfileAndStartDiagnostic(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthorized')

  const grade = String(formData.get('grade') ?? '').trim() || null
  const goal = String(formData.get('goal') ?? '').trim() || null

  const { error } = await supabase.from('profiles').update({ grade, goal }).eq('id', user.id)
  if (error) throw new Error(error.message)

  const id = await createSession('diagnostic')
  redirect(`/learn?sessionId=${id}`)
}
