'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  }
}

export async function signIn(formData: FormData) {
  const { email, password } = readCredentials(formData)
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signUp(formData: FormData) {
  const { email, password } = readCredentials(formData)
  const supabase = await createClient()

  // Local dev disables email confirmation (see supabase/config.toml), so a
  // successful sign-up returns a session immediately.
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  revalidatePath('/', 'layout')
  redirect('/login')
}
