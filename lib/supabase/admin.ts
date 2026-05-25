// Server-only Supabase client using the service_role key.
//
// service_role BYPASSES RLS, so this client must never reach the browser. We do
// NOT use the `server-only` package (it isn't in our lockfile — see
// SECURITY_HARDENING_PLAN.md). Instead the server-only boundary is held by:
//   1. the module-level window guard below (throws if this code is ever evaluated
//      in a browser bundle),
//   2. import hygiene — only Server Actions / server scripts import it (grep-verified),
//   3. env naming — SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix, so Next
//      never inlines it into client bundles.
import { createClient } from '@supabase/supabase-js'

// Tripwire: importing this module into a Client Component would run this in the
// browser and fail loudly here (mirrors what `import 'server-only'` would do).
if (typeof window !== 'undefined') {
  throw new Error('lib/supabase/admin.ts is server-only and must not be imported into client code')
}

/**
 * Privileged Supabase client (service_role). Use only in server code that needs
 * to read data RLS hides from the user — e.g. the canonical answer during grading.
 * Never expose its results wholesale to the client.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set (server-only env required for grading)')
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
