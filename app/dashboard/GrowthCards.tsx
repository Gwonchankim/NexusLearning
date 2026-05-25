// "오늘 할 일" growth cards (PR5): today's growth headline, streak, today quest.
// Server component; quest item CTA uses the startQuestSession server action.

import { startQuestSession } from '@/app/learn/actions'
import { pp, type DashboardGrowth } from '@/lib/growth'

export default function GrowthCards({ growth }: { growth: DashboardGrowth }) {
  const { todayDelta, streak, quest, nameById } = growth
  const todayPp = pp(todayDelta)
  const todayText =
    todayPp > 0
      ? `오늘의 성장 +${todayPp}%p`
      : todayDelta < 0
        ? '복습으로 기반을 다졌어요'
        : '오늘도 한 걸음 🙂'
  const streakText = streak.todayDone
    ? `🔥 ${streak.current}일 연속`
    : streak.current > 0
      ? `🔥 ${streak.current}일 · 오늘 풀면 ${streak.current + 1}일`
      : '오늘 시작해요'

  return (
    <section className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 p-6">
          <p className="text-xs uppercase tracking-wide text-gray-400">오늘의 성장</p>
          <p className="mt-1 text-lg font-semibold">{todayText}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-6">
          <p className="text-xs uppercase tracking-wide text-gray-400">스트릭</p>
          <p className="mt-1 text-lg font-semibold">{streakText}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">오늘의 퀘스트</p>
          <p className="text-xs text-gray-400">
            신규 {quest.newDone}/{quest.newTotal} · 복습 {quest.reviewDone}/{quest.reviewTotal}
          </p>
        </div>
        {quest.items.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            오늘 할 퀘스트가 없어요. 위 추천 카드에서 시작해 보세요.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {quest.items.map((it) => (
              <li key={it.conceptId} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span>{it.done ? '✅' : '⬜'}</span>
                  <span>{nameById[it.conceptId] ?? it.conceptId}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    {it.kind === 'new' ? '신규' : '복습'}
                  </span>
                </span>
                {!it.done && (
                  <form action={startQuestSession.bind(null, it.conceptId)}>
                    <button className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium">
                      시작
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
