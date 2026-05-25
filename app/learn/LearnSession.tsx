'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitAttempt, endSession } from './actions'
import type { SubmitAttemptResult, SessionSummary } from './actions'

export interface LearnProblem {
  id: string
  concept_id: string
  stem: string
  choices: string[] | null
  difficulty: string
  answer_type: 'multiple_choice' | 'short_answer' | 'expression'
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

export default function LearnSession({
  sessionId,
  mode,
  ended,
  problems,
  answeredProblemIds,
}: {
  sessionId: string
  mode: 'practice' | 'diagnostic'
  ended: boolean
  problems: LearnProblem[]
  answeredProblemIds: string[]
}) {
  const router = useRouter()
  const remaining = problems.filter((p) => !answeredProblemIds.includes(p.id))

  const [idx, setIdx] = useState(0)
  const [value, setValue] = useState('')
  const [feedback, setFeedback] = useState<SubmitAttemptResult | null>(null)
  const [pending, setPending] = useState(false)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [questionStart, setQuestionStart] = useState(() => Date.now())

  const goHome = () => {
    router.push('/dashboard')
    router.refresh()
  }

  async function finish() {
    if (pending) return
    setPending(true)
    try {
      setSummary(await endSession(sessionId))
    } finally {
      setPending(false)
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!value.trim() || pending) return
    setPending(true)
    try {
      const res = await submitAttempt({
        sessionId,
        problemId: remaining[idx].id,
        submittedAnswer: value,
        timeMs: Date.now() - questionStart,
      })
      setFeedback(res)
    } finally {
      setPending(false)
    }
  }

  async function next() {
    setFeedback(null)
    setValue('')
    setQuestionStart(Date.now())
    if (idx + 1 < remaining.length) {
      setIdx(idx + 1)
    } else {
      await finish()
    }
  }

  // ---- terminal states ----
  if (ended && !summary) {
    return (
      <Shell>
        <p className="text-sm text-gray-500">이미 종료된 세션이에요.</p>
        <HomeButton onClick={goHome} />
      </Shell>
    )
  }

  if (summary) {
    const rate = summary.problemCount ? summary.correctCount / summary.problemCount : 0
    const d = summary.sessionMasteryDelta
    const ppd = d == null ? 0 : Math.round(d * 100)
    const headline =
      d == null
        ? null
        : ppd > 0
          ? `이해도 +${ppd}%p 올랐어요`
          : d < 0
            ? '복습으로 기반을 다졌어요'
            : '기반을 유지했어요'
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">세션 완료 🎉</h1>
        {headline && <p className="mt-2 text-lg font-medium text-blue-700">{headline}</p>}
        <div className="mt-6 rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">
            {mode === 'diagnostic' ? '미니 진단' : '학습 세션'} 결과
          </p>
          <p className="mt-2 text-4xl font-semibold">
            {summary.correctCount} / {summary.problemCount}
          </p>
          <p className="text-xs uppercase tracking-wide text-gray-400">정답 / 전체 ({pct(rate)})</p>
        </div>

        {summary.conceptDeltas.length > 0 && (
          <div className="mt-4 space-y-3 rounded-lg border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">개념별 변화</p>
            {summary.conceptDeltas.map((c) => (
              <div key={c.conceptId}>
                <div className="flex justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="text-gray-500">
                    {pct(c.before)} → {pct(c.after)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded bg-gray-100">
                  <div
                    className="h-1.5 rounded bg-blue-500"
                    style={{ width: `${Math.max(0, Math.min(100, Math.round(c.after * 100)))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {summary.nextReviewAt && (
          <p className="mt-4 text-sm text-gray-500">
            {new Date(summary.nextReviewAt).toLocaleDateString('ko-KR', {
              month: 'numeric',
              day: 'numeric',
            })}
            에 다시 확인해요
          </p>
        )}

        <HomeButton onClick={goHome} />
      </Shell>
    )
  }

  if (remaining.length === 0) {
    return (
      <Shell>
        <p className="text-sm text-gray-500">이 세션의 문제를 모두 풀었어요.</p>
        <button
          onClick={finish}
          disabled={pending}
          className="mt-6 rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          결과 보기
        </button>
      </Shell>
    )
  }

  // ---- active question ----
  const current = remaining[idx]
  const total = remaining.length

  return (
    <Shell>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {mode === 'diagnostic' ? '진단' : '연습'} · {idx + 1} / {total}
        </span>
        <span>
          {current.concept_id} · {current.difficulty}
        </span>
      </div>

      <p className="mt-4 whitespace-pre-wrap text-lg">{current.stem}</p>

      {!feedback ? (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {current.answer_type === 'multiple_choice' && current.choices ? (
            <div className="space-y-2">
              {current.choices.map((c) => (
                <label
                  key={c}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="choice"
                    value={c}
                    checked={value === c}
                    onChange={(e) => setValue(e.target.value)}
                  />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              placeholder="정답 입력"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          )}
          <button
            type="submit"
            disabled={pending || !value.trim()}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            제출
          </button>
        </form>
      ) : (
        <div className="mt-6 space-y-4">
          <div
            className={`rounded-md border p-4 ${
              feedback.correct ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
            }`}
          >
            <p className="font-medium">{feedback.correct ? '정답이에요 ✓' : '아쉬워요 ✗'}</p>
            {!feedback.correct && feedback.wrongFeedback && (
              <p className="mt-1 text-sm text-gray-700">{feedback.wrongFeedback}</p>
            )}
            {feedback.solution && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">풀이: {feedback.solution}</p>
            )}
            <p className="mt-3 text-xs text-gray-500">
              숙련도 {pct(feedback.masteryBefore)} → {pct(feedback.masteryAfter)}
              {feedback.nextReviewAt &&
                ` · 다음 복습 ${new Date(feedback.nextReviewAt).toLocaleDateString('ko-KR')}`}
            </p>
          </div>
          <button
            onClick={next}
            disabled={pending}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {idx + 1 < total ? '다음 문제' : '결과 보기'}
          </button>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl px-6 py-12">{children}</main>
}

function HomeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-6 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium"
    >
      대시보드로
    </button>
  )
}
