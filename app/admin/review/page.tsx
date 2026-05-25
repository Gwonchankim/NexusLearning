import { createClient } from '@/lib/supabase/server'
import { approveProblem, rejectProblem } from './actions'

export default async function ReviewPage() {
  const supabase = await createClient()
  const { data: drafts } = await supabase
    .from('problems')
    .select(
      'id, import_key, concept_id, stem, choices, answer, solution, wrong_feedback, difficulty, answer_type, source',
    )
    .eq('reviewed', false)
    .order('concept_id')
    .order('created_at')

  const items = drafts ?? []

  return (
    <main className="space-y-6">
      <h1 className="text-xl font-semibold">검수 대기 ({items.length})</h1>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">검수할 미검수 문제가 없습니다.</p>
      ) : (
        items.map((p) => (
          <form
            key={p.id}
            className="space-y-2 rounded-lg border border-gray-200 p-4 text-sm"
          >
            <input type="hidden" name="id" value={p.id} />
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-mono">{p.import_key ?? p.id}</span>
              <span>source: {p.source}</span>
            </div>

            <Field label="concept_id" name="concept_id" defaultValue={p.concept_id} />
            <TextArea label="stem" name="stem" defaultValue={p.stem} />
            {Array.isArray(p.choices) && p.choices.length > 0 ? (
              <p className="text-xs text-gray-500">choices: {JSON.stringify(p.choices)}</p>
            ) : null}
            <Field label="answer" name="answer" defaultValue={p.answer} />
            <TextArea label="solution" name="solution" defaultValue={p.solution ?? ''} />
            <TextArea
              label="wrong_feedback"
              name="wrong_feedback"
              defaultValue={p.wrong_feedback ?? ''}
            />

            <div className="flex gap-3">
              <Select
                label="difficulty"
                name="difficulty"
                defaultValue={p.difficulty}
                options={['easy', 'medium', 'hard']}
              />
              <Select
                label="answer_type"
                name="answer_type"
                defaultValue={p.answer_type}
                options={['multiple_choice', 'short_answer', 'expression']}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                formAction={approveProblem}
                className="rounded-md bg-black px-4 py-1.5 text-white"
              >
                승인
              </button>
              <button
                formAction={rejectProblem}
                className="rounded-md border border-red-300 px-4 py-1.5 text-red-600"
              >
                반려(삭제)
              </button>
            </div>
          </form>
        ))
      )}
    </main>
  )
}

function Field({
  label,
  name,
  defaultValue,
}: {
  label: string
  name: string
  defaultValue: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="rounded border border-gray-300 px-2 py-1"
      />
    </label>
  )
}

function TextArea({
  label,
  name,
  defaultValue,
}: {
  label: string
  name: string
  defaultValue: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={2}
        className="rounded border border-gray-300 px-2 py-1"
      />
    </label>
  )
}

function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string
  name: string
  defaultValue: string
  options: string[]
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="rounded border border-gray-300 px-2 py-1"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
