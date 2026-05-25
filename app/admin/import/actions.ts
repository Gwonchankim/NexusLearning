'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Import is delegated entirely to the public.import_problems(jsonb) DB function
// (admin-enforced, idempotent, always reviewed=false). See migration 0004.
export async function importProblems(formData: FormData) {
  const supabase = await createClient()

  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (!isAdmin) redirect('/dashboard')

  const raw = String(formData.get('json') ?? '')
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    redirect('/admin/import?error=' + encodeURIComponent('JSON 파싱 실패'))
  }

  const { data, error } = await supabase.rpc('import_problems', { payload })
  if (error) {
    redirect('/admin/import?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/admin')
  revalidatePath('/admin/review')
  redirect('/admin/import?result=' + encodeURIComponent(JSON.stringify(data)))
}
