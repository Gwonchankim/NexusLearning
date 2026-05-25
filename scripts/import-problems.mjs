// Local helper: bulk-import problem drafts via the public.import_problems RPC.
// The RPC is admin-only, so this signs in as an admin user first.
// Never commits keys — everything comes from env:
//   SUPABASE_URL (default http://127.0.0.1:54321)
//   SUPABASE_ANON_KEY        (from `npx supabase status -o env`)
//   ADMIN_EMAIL / ADMIN_PASSWORD  (an account listed in public.admin_users)
//
// Usage (PowerShell example):
//   $env:SUPABASE_ANON_KEY="..."; $env:ADMIN_EMAIL="admin@local"; $env:ADMIN_PASSWORD="..."
//   node scripts/import-problems.mjs
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const EMAIL = process.env.ADMIN_EMAIL
const PASSWORD = process.env.ADMIN_PASSWORD

if (!ANON || !EMAIL || !PASSWORD) {
  console.error('Missing env: SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD (optionally SUPABASE_URL).')
  process.exit(1)
}

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'problems')
const files = (await readdir(contentDir)).filter((f) => f.endsWith('.json'))
let payload = []
for (const f of files) {
  const arr = JSON.parse(await readFile(join(contentDir, f), 'utf8'))
  if (!Array.isArray(arr)) throw new Error(`${f} is not a JSON array`)
  payload = payload.concat(arr)
}
console.log(`loaded ${payload.length} draft(s) from ${files.length} file(s)`)

const signin = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
const session = await signin.json()
if (!session.access_token) {
  console.error('admin sign-in failed:', session.error_description || session.msg || JSON.stringify(session))
  process.exit(1)
}

const res = await fetch(`${BASE}/rest/v1/rpc/import_problems`, {
  method: 'POST',
  headers: {
    apikey: ANON,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ payload }),
})
const result = await res.json()
if (!res.ok) {
  console.error('import failed:', JSON.stringify(result))
  process.exit(1)
}
console.log('import result:', JSON.stringify(result))
