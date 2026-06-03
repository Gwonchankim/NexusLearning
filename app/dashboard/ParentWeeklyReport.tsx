// Read-only weekly parent report section (PR11). Server component, no deps.
// Parent-facing Korean microcopy, sentence-first: the conclusion and concept
// names lead; mastery numbers stay in small auxiliary text. Never claims score
// gains. Degrades to cautious copy when data is empty/sparse.

import { pp, type WeeklyParentReport } from '@/lib/growth'

const KIND_LABEL: Record<WeeklyParentReport['actions'][number]['kind'], string> = {
  review: '복습',
  prereq: '기초 다지기',
  frontier: '새 개념',
}

export default function ParentWeeklyReport({ report }: { report: WeeklyParentReport }) {
  const { state } = report

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-gray-700">이번 주 학부모 리포트</h2>
      <p className="mt-0.5 text-xs text-gray-400">
        최근 7일 학습을 바탕으로 어디서 좋아지고 어디가 위험한지, 다음 7일에 무엇을 하면 좋은지 정리했어요.
      </p>

      {/* 한 줄 결론 */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-800">{report.conclusion}</p>
        {state !== 'empty' && (
          <p className="mt-1 text-xs text-gray-500">이번 주 학습 완료 {report.completedSessions}회</p>
        )}
      </div>

      {state !== 'empty' && (
        <div className="mt-4 space-y-4">
          {/* 이번 주 안정된 개념 */}
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">이번 주 안정된 개념</p>
            {report.topGrowth.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {report.topGrowth.map((g) => (
                  <li key={g.conceptId} className="text-sm font-medium text-gray-800">
                    {g.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">아직 이번 주 성장을 보여줄 데이터가 충분하지 않아요.</p>
            )}
          </div>

          {/* 지금 주의가 필요한 개념 */}
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">지금 주의가 필요한 개념</p>
            {report.riskConcepts.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {report.riskConcepts.map((r) => (
                  <li key={r.conceptId}>
                    <p className="text-sm font-medium text-gray-800">{r.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      숙련도 {pp(r.effectiveMastery)}%
                      {r.due ? ' · 복습 시점이 지났어요' : ''}
                      {r.recentWrong > 0 ? ` · 최근 오답 ${r.recentWrong}회` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">현재 특별히 주의할 개념은 없어요.</p>
            )}
          </div>

          {/* 다음 7일 추천 액션 */}
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">다음 7일 추천 액션</p>
            {report.actions.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {report.actions.map((a) => (
                  <li key={a.conceptId} className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">{a.name}</span>
                    <span className="text-gray-500"> · {KIND_LABEL[a.kind]}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{a.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">추천 액션이 충분히 모이면 보여드릴게요.</p>
            )}
          </div>

          {/* 복습 현황 (비율 아님 — 셀 수 있는 사실만) */}
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">복습 현황</p>
            <p className="mt-2 text-sm text-gray-700">
              지금 복습이 밀린 개념 <span className="font-semibold">{report.reviewAdherence.overdueNow}개</span> · 이번 주 풀이 기록이 있는 개념{' '}
              <span className="font-semibold">{report.reviewAdherence.attemptedThisWeek}개</span>
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
