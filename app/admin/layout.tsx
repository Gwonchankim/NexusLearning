import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Server-side admin gate for everything under /admin.
// Authentication is also enforced in proxy.ts; this adds the admin check.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (!isAdmin) redirect('/dashboard')

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <nav className="mb-8 flex items-center gap-4 text-sm">
        <span className="font-semibold">EduHelp_AI 관리자</span>
        <a className="text-gray-600 hover:underline" href="/admin">
          대시보드
        </a>
        <a className="text-gray-600 hover:underline" href="/admin/review">
          검수
        </a>
        <a className="text-gray-600 hover:underline" href="/admin/import">
          Import
        </a>
        <a className="ml-auto text-gray-400 hover:underline" href="/dashboard">
          ← 학생 화면
        </a>
      </nav>
      {children}
    </div>
  )
}
