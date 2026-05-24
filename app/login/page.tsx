import { signIn, signUp } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">EduHelp_AI</h1>
        <p className="text-sm text-gray-500">로그인하고 오늘의 성장을 시작하세요.</p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      ) : null}

      <form className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          이메일
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          비밀번호
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="current-password"
            className="rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>

        <div className="mt-2 flex gap-2">
          <button
            formAction={signIn}
            className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            로그인
          </button>
          <button
            formAction={signUp}
            className="flex-1 rounded-md border border-black px-4 py-2 text-sm font-medium"
          >
            회원가입
          </button>
        </div>
      </form>

      <p className="text-xs text-gray-400">
        로컬 개발에서는 이메일 인증이 꺼져 있어 회원가입 즉시 로그인됩니다.
      </p>
    </main>
  )
}
