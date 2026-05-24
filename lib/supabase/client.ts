import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for Client Components (browser).
 *
 * Not used by any UI in PR1 — login is handled with Server Actions — but kept
 * here so PR3 client components (e.g. the learning session) can use it.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
