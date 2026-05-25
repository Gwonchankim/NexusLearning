import Link from 'next/link'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/login/actions'
import { startPracticeSession, startConceptSession } from '@/app/learn/actions'
import { createClient } from '@/lib/supabase/server'
import { loadRecommendation } from '@/app/learn/recommend'
import type { NodeStatus } from '@/lib/graph'
import KnowledgeMap from './KnowledgeMap'
import GrowthCards from './GrowthCards'
import RecentSparkline from './RecentSparkline'
import { loadGrowth } from './growth'

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

const STATUS_LABEL: Record<NodeStatus, string> = {
  locked: '잠김',
  available: '학습 가능',
  in_progress: '학습 중',
  mastered: '숙달',
}
const STATUS_DOT: Record<NodeStatus, string> = {
  locked: 'bg-gray-300',
  available: 'bg-blue-500',
  in_progress: 'bg-blue-300',
  mastered: 'bg-blue-600',
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  // proxy.ts already guards this route; this is defense-in-depth.
  if (!user) redirect('/login')

  const { hasProgress, avgEffectiveMastery, dueCount, concepts, rec, nameById, effByConcept } =
    await loadRecommendation()
  const recommended = rec.recommended
  const growth = hasProgress ? await loadGrowth() : null

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
              <p className="text-xs uppercase tracking-wide text-gray-400">평균 숙련도 (학습한 개념)</p>
              <p className="mt-1 text-3xl font-semibold">{pct(avgEffectiveMastery)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-6">
              <p className="text-xs uppercase tracking-wide text-gray-400">복습 도래</p>
              <p className="mt-1 text-3xl font-semibold">{dueCount}</p>
            </div>
          </section>

          {growth && <GrowthCards growth={growth} />}

          {growth && growth.recent.length >= 2 && (
            <section className="mt-6 rounded-lg border border-gray-200 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">최근 성장 변화</p>
              <div className="mt-2">
                <RecentSparkline recent={growth.recent} />
              </div>
            </section>
          )}

          {recommended && (
            <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-6">
              {recommended.source === 'frontier' ? (
                <>
                  <span className="inline-block rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
                    프런티어
                  </span>
                  <p className="mt-2 text-xs uppercase tracking-wide text-gray-500">다음 학습 개념</p>
                  <p className="mt-0.5 text-xl font-semibold">{nameById[recommended.conceptId]}</p>
                  <form action={startConceptSession.bind(null, recommended.conceptId)} className="mt-4">
                    <button className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
                      이 개념 학습
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <span className="inline-block rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
                    복습
                  </span>
                  <p className="mt-2 text-sm text-gray-600">전체 기반이 탄탄해요. 한 번 더 다져볼까요?</p>
                  <p className="mt-0.5 text-xl font-semibold">{nameById[recommended.conceptId]} 복습</p>
                  <form action={startConceptSession.bind(null, recommended.conceptId)} className="mt-4">
                    <button className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
                      복습 시작
                    </button>
                  </form>
                </>
              )}
            </section>
          )}

          <form action={startPracticeSession} className="mt-4">
            <button className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium">
              일반 학습 세션 시작
            </button>
          </form>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-gray-700">지식맵</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              전체 개념의 선수관계와 상태입니다. 학습은 위 추천 카드에서 시작하세요.
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 p-4">
              <KnowledgeMap
                concepts={concepts}
                statuses={rec.statuses}
                recommendedId={recommended?.conceptId ?? null}
              />
            </div>
          </section>

          <section className="mt-8 space-y-2">
            {concepts.map((c) => {
              const status = rec.statuses[c.id] ?? 'locked'
              const eff = effByConcept[c.id]
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                    {c.name}
                  </span>
                  <span className="text-gray-500">
                    {eff === undefined ? STATUS_LABEL[status] : pct(eff)}
                  </span>
                </div>
              )
            })}
          </section>
        </>
      )}
    </main>
  )
}
