import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { saveProfileAndStartDiagnostic } from './actions'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <h1 className="text-2xl font-semibold">시작하기 전에</h1>
      <p className="mt-2 text-sm text-gray-500">
        학년과 목표를 알려주면 5~7문제 미니 진단으로 시작 숙련도를 잡아줄게요.
      </p>

      <form action={saveProfileAndStartDiagnostic} className="mt-8 space-y-5">
        <div>
          <label className="block text-sm font-medium" htmlFor="grade">
            학년
          </label>
          <select
            id="grade"
            name="grade"
            defaultValue="고1"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="중3">중3</option>
            <option value="고1">고1</option>
            <option value="고2">고2</option>
            <option value="고3">고3</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="goal">
            목표 (선택)
          </label>
          <input
            id="goal"
            name="goal"
            type="text"
            placeholder="예: 내신 1등급, 모의고사 2등급"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          미니 진단 시작
        </button>
      </form>
    </main>
  )
}
