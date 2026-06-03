// Read-only diagnostic-based initial parent report (PR12). Server component, no
// deps. Shown on /dashboard first entry (before a week of data) — yields to the
// PR11 weekly report once enough data exists. Parent-facing, sentence-first,
// hedged ("초기 진단 기준", "흔들린 신호"); never claims score/grade gains.
// The "오늘 할 액션" CTA reuses startConceptSession (server re-validates
// isStartable); the loader guarantees the target is startable + problem-backed.

import { startConceptSession, startPracticeSession } from '@/app/learn/actions'
import { pp, type DiagnosticParentSampleReport } from '@/lib/growth'

export default function DiagnosticSampleReport({
  report,
}: {
  report: DiagnosticParentSampleReport
}) {
  if (report.state === 'empty') return null

  return (
    <section className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <span className="inline-block rounded-full bg-blue-200 px-2 py-0.5 text-xs font-medium text-blue-900">
        미니 진단 결과
      </span>
      <h2 className="mt-2 text-sm font-semibold text-gray-800">진단 기반 초기 리포트</h2>
      <p className="mt-1 text-sm font-medium text-gray-800">{report.conclusion}</p>
      <p className="mt-0.5 text-xs text-gray-500">
        초기 진단 기준이라, 학습이 쌓이면 주간 성장 리포트로 더 정확해져요.
      </p>

      {report.state === 'ok' && (
        <>
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              지금 주의가 필요한 개념 (진단 기준)
            </p>
            <ul className="mt-2 space-y-1">
              {report.riskConcepts.map((r) => (
                <li key={r.conceptId} className="text-sm text-gray-800">
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-1 text-xs text-gray-500">
                    숙련도 {pp(r.effectiveMastery)}%
                    {r.wrongInDiagnostic ? ' · 진단에서 흔들린 신호' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">다음 7일 회복 플랜</p>
            <ul className="mt-2 space-y-2">
              {report.recoveryPlan.map((d) => (
                <li key={d.bucket} className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{d.label}</span> · {d.focus}
                  {d.concepts.length > 0 && (
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {d.concepts.map((c) => c.name).join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">오늘 바로 할 액션</p>
        {report.todayAction ? (
          <form action={startConceptSession.bind(null, report.todayAction.conceptId)} className="mt-2">
            <p className="text-sm text-gray-700">{report.todayAction.reason}</p>
            <button className="mt-2 w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
              {report.todayAction.name} · 이 개념부터 회복하기
            </button>
          </form>
        ) : (
          <form action={startPracticeSession} className="mt-2">
            <p className="text-sm text-gray-700">오늘은 가볍게 한 세션으로 시작해 보세요.</p>
            <button className="mt-2 w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium">
              오늘 회복 학습 시작
            </button>
          </form>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-500">계속 학습하면 주간 성장 리포트로 변화가 추적됩니다.</p>
    </section>
  )
}
