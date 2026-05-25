import { createClient } from '@/lib/supabase/server'

const TARGET = 30

export default async function AdminDashboard() {
  const supabase = await createClient()

  // Admin RLS lets us see all problems (reviewed + unreviewed).
  const { data: rows } = await supabase.from('problems').select('concept_id, reviewed')
  const problems = rows ?? []

  const reviewed = problems.filter((p) => p.reviewed).length
  const pending = problems.length - reviewed

  const byConcept = new Map<string, { reviewed: number; pending: number }>()
  for (const p of problems) {
    const c = byConcept.get(p.concept_id) ?? { reviewed: 0, pending: 0 }
    if (p.reviewed) c.reviewed++
    else c.pending++
    byConcept.set(p.concept_id, c)
  }
  const concepts = [...byConcept.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <main className="space-y-8">
      <section className="grid grid-cols-3 gap-4">
        <Stat label="reviewed" value={reviewed} />
        <Stat label="pending" value={pending} />
        <Stat label={`목표 ${TARGET}`} value={`${Math.min(reviewed, TARGET)}/${TARGET}`} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-500">개념별 현황</h2>
        {concepts.length === 0 ? (
          <p className="text-sm text-gray-400">
            아직 문제가 없습니다. Import 탭에서 초안을 불러오세요.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-400">
                <th className="py-1">concept</th>
                <th className="py-1 text-right">reviewed</th>
                <th className="py-1 text-right">pending</th>
              </tr>
            </thead>
            <tbody>
              {concepts.map(([id, c]) => (
                <tr key={id} className="border-b border-gray-100">
                  <td className="py-1 font-mono text-xs">{id}</td>
                  <td className="py-1 text-right">{c.reviewed}</td>
                  <td className="py-1 text-right text-gray-500">{c.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  )
}
