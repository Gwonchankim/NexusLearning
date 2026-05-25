import Link from 'next/link'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/login/actions'
import { startPracticeSession } from '@/app/learn/actions'
import { createClient } from '@/lib/supabase/server'
import { effectiveMastery } from '@/lib/adaptive'

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  // proxy.ts already guards this route; this is defense-in-depth.
  if (!user) redirect('/login')

  const [{ data: concepts }, { data: mastery }] = await Promise.all([
    supabase.from('concepts').select('id, name, order_index').order('order_index'),
    supabase
      .from('concept_mastery')
      .select('concept_id, mastery, last_reviewed_at, next_review_at')
      .eq('user_id', user.id),
  ])

  const now = new Date()
  const masteryRows = mastery ?? []
  const hasProgress = masteryRows.length > 0
  const byConcept = new Map(masteryRows.map((m) => [m.concept_id, m]))

  const dueCount = masteryRows.filter(
    (m) => m.next_review_at && new Date(m.next_review_at) <= now,
  ).length

  const effByConcept = (conceptId: string): number | null => {
    const m = byConcept.get(conceptId)
    if (!m) return null
    return effectiveMastery({ mastery: m.mastery, attemptsCount: 0, lastReviewedAt: m.last_reviewed_at }, now)
  }

  const studied = (concepts ?? [])
    .map((c) => effByConcept(c.id))
    .filter((v): v is number => v !== null)
  const avg = studied.length ? studied.reduce((a, b) => a + b, 0) / studied.length : 0

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Growth Map</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
        <form action={signOut}>
          <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">로그아웃</button>
        </form>
      </header>

      {!hasProgress ? (
        <section className="mt-10 rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">아직 학습 데이터가 없어요.</p>
          <p className="mt-1 text-sm text-gray-500">미니 진단으로 시작 숙련도를 잡아볼까요?</p>
          <Link
            href="/onboarding"
            className="mt-6 inline-block rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            미니 진단 시작
          </Link>
        </section>
      ) : (
        <>
          <section className="mt-10 grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 p-6">
              <p className="text-xs uppercase tracking-wide text-gray-400">평균 숙련도</p>
              <p className="mt-1 text-3xl font-semibold">{pct(avg)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-6">
              <p className="text-xs uppercase tracking-wide text-gray-400">복습 도래</p>
              <p className="mt-1 text-3xl font-semibold">{dueCount}</p>
            </div>
          </section>

          <form action={startPracticeSession} className="mt-6">
            <button className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
              학습 세션 시작
            </button>
          </form>

          <section className="mt-8 space-y-2">
            {(concepts ?? []).map((c) => {
              const eff = effByConcept(c.id)
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm"
                >
                  <span>{c.name}</span>
                  <span className="text-gray-500">{eff === null ? '미학습' : pct(eff)}</span>
                </div>
              )
            })}
          </section>
        </>
      )}
    </main>
  )
}
