// Internal PR6 report: loop completion + CTA conversion + funnel + D1/D7 retention.
// Calls the report_metrics() RPC (service_role only) and prints console tables.
// Requires SUPABASE_SERVICE_ROLE_KEY — server-only, never commit it.
// Env:
//   SUPABASE_URL (default http://127.0.0.1:54321)
//   SUPABASE_SERVICE_ROLE_KEY (required)
//
// Usage:
//   $env:SUPABASE_SERVICE_ROLE_KEY="..."; node scripts/report-metrics.mjs [--from <ISO>] [--to <ISO>]
//   (window is half-open [from, to); KST day bucketing. For "KST day D" pass D 00:00:00+09.)

const BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!KEY) {
  console.error(
    'Missing env: SUPABASE_SERVICE_ROLE_KEY (required).\n' +
      'report_metrics is service_role-only — pass the service_role key (server-only, never commit).',
  )
  process.exit(1)
}

const args = process.argv.slice(2)
const argVal = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null
}
const from = argVal('--from')
const to = argVal('--to')
if (!from) {
  console.warn(
    '⚠  --from not set: CTA conversion is counted from the first event timestamp onward.\n' +
      '   Pass --from to bound the window explicitly (avoids mixing in pre-PR6 `source` sessions).',
  )
}

const res = await fetch(`${BASE}/rest/v1/rpc/report_metrics`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_from: from, p_to: to }),
})
const m = await res.json()
if (!res.ok) {
  console.error('report_metrics failed:', JSON.stringify(m))
  process.exit(1)
}

const pct = (v) => (v == null ? '—' : `${v}%`)

console.log('\n=== Loop completion (sessions started in window) ===')
console.table({
  all: { started: m.completion.started, completed: m.completion.completed, rate: pct(m.completion.rate) },
  diagnostic: {
    started: m.completion.by_mode.diagnostic.started,
    completed: m.completion.by_mode.diagnostic.completed,
    rate: pct(m.completion.by_mode.diagnostic.rate),
  },
  practice: {
    started: m.completion.by_mode.practice.started,
    completed: m.completion.by_mode.practice.completed,
    rate: pct(m.completion.by_mode.practice.rate),
  },
})

console.log(`\n=== CTA conversion (window_from: ${m.cta.window_from ?? 'n/a'}) ===`)
console.table({
  clicks: {
    total: m.cta.clicks,
    recommendation_clicked: m.cta.clicks_by_name.recommendation_clicked,
    quest_started: m.cta.clicks_by_name.quest_started,
  },
  converted: {
    total: m.cta.converted,
    frontier: m.cta.converted_by_source.frontier,
    fallback: m.cta.converted_by_source.fallback,
  },
  conversion: { rate: pct(m.cta.conversion_pct) },
})

console.log('\n=== Funnel (signup cohort in window) ===')
console.table({
  signups: { count: m.funnel.signups },
  onboarded: { count: m.funnel.onboarded },
  completed_at_least_one: { count: m.funnel.completed_at_least_one },
})

console.log('\n=== Retention (DN = active exactly N KST days after signup; — = immature cohort) ===')
const rows = (m.retention || []).map((r) => ({
  cohort_day: r.cohort_day,
  cohort_size: r.cohort_size,
  d1_mature: r.d1_mature,
  d1: r.d1_mature ? `${r.d1} (${pct(r.d1_pct)})` : '—',
  d7_mature: r.d7_mature,
  d7: r.d7_mature ? `${r.d7} (${pct(r.d7_pct)})` : '—',
}))
if (rows.length) console.table(rows)
else console.log('(no cohorts in window)')
