import { importProblems } from './actions'

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; result?: string }>
}) {
  const { error, result } = await searchParams

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">문제 초안 Import</h1>
      <p className="text-sm text-gray-500">
        JSON 배열을 붙여넣으세요. 각 항목은 <code>import_key</code>(필수)와{' '}
        <code>concept_id</code>, <code>stem</code>, <code>answer</code> 등을 포함합니다. import 직후
        모든 문제는 <strong>reviewed=false</strong>이며, 같은 <code>import_key</code>는 멱등 갱신됩니다(승인본은 보호).
      </p>

      {error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      ) : null}
      {result ? (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">결과: {result}</p>
      ) : null}

      <form action={importProblems} className="space-y-3">
        <textarea
          name="json"
          rows={14}
          required
          placeholder='[{"import_key":"poly-mult-001","concept_id":"poly-mult","stem":"...","answer":"...","difficulty":"medium","answer_type":"multiple_choice","source":"ai"}]'
          className="w-full rounded border border-gray-300 p-3 font-mono text-xs"
        />
        <button className="rounded-md bg-black px-4 py-2 text-sm text-white">Import</button>
      </form>
    </main>
  )
}
