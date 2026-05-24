import { redirect } from 'next/navigation'
import { signOut } from '@/app/login/actions'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // proxy.ts already guards this route; this is defense-in-depth.
  if (!user) {
    redirect('/login')
  }

  const { count: conceptCount } = await supabase
    .from('concepts')
    .select('*', { count: 'exact', head: true })

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Growth Map</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
        <form action={signOut}>
          <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            로그아웃
          </button>
        </form>
      </header>

      <section className="mt-10 rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm text-gray-500">아직 학습 데이터가 없어요.</p>
        <p className="mt-1 text-sm text-gray-500">
          학습 루프는 다음 단계(PR3)에서 연결됩니다.
        </p>
        <p className="mt-6 text-4xl font-semibold">{conceptCount ?? 0}</p>
        <p className="text-xs uppercase tracking-wide text-gray-400">seeded concepts</p>
      </section>
    </main>
  )
}
