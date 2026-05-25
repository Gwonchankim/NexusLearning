# EduHelp_AI

고1 수학(공통수학1 · 다항식) 학습 MVP. "어제보다 나아졌다"고 느끼는 성장 체감 루프를 검증하는 것이 목표입니다. 전체 전략·범위·데이터 모델·빌드 순서는 [`PLAN.md`](./PLAN.md)를 참고하세요.

스택: **Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres · Auth · RLS)**

> 현재 단계는 **PR1 (기반 구축)** 입니다. 학습 세션·문제 풀이·관리자 검수·AI·결제 기능은 포함되어 있지 않습니다.

---

## 사전 요구사항

| 도구 | 용도 | 비고 |
| --- | --- | --- |
| Node.js 20+ | 앱 실행/빌드 | 개발은 Node 24에서 진행 |
| npm | 패키지 관리 | |
| **Docker Desktop** | 로컬 Supabase 컨테이너 구동 | **필수**, 직접 설치 후 실행 중이어야 함 (<https://www.docker.com/products/docker-desktop/>) |
| Supabase CLI | 로컬 Postgres/Auth, 마이그레이션·seed 적용 | **프로젝트 devDependency로 포함** → 전역 설치 불필요. `npx supabase` 또는 `npm run db:*`로 실행 |

> ⚠️ **Docker Desktop이 설치·실행되어 있지 않으면 DB/Auth가 동작하지 않습니다.** 앱 코드(스캐폴드·페이지)는 빌드되지만, 로그인과 데이터 조회는 로컬 Supabase 스택이 떠 있어야 작동합니다.

---

## 빠른 시작

```bash
# 1) 의존성 설치 (Supabase CLI도 devDependency로 함께 설치됨)
npm install

# 2) Docker Desktop을 먼저 설치하고 실행해 둔다. CLI 실행 가능 여부 확인:
npx supabase --version

# 3) 로컬 Supabase 스택 기동 (supabase/migrations/* 적용 + supabase/seed.sql 자동 실행)
npm run db:start          # = npx supabase start

# 4) 로컬 Supabase 접속 정보(URL/키) 확인
npm run db:status         # = npx supabase status

# 5) 환경변수 파일 생성 후 위 값으로 채우기
#    (.env.local은 git 추적 제외 — 절대 커밋하지 말 것)
cp .env.example .env.local        # Windows PowerShell: Copy-Item .env.example .env.local

# 6) 앱 실행
npm run dev
```

이후 <http://localhost:3000> 접속 → `/login`에서 회원가입(로컬은 이메일 인증 비활성) → `/dashboard`에서 seed된 concept 개수를 확인할 수 있습니다.

---

## 환경변수

`.env.example`을 `.env.local`로 복사한 뒤 값을 채웁니다. 값은 **`npm run db:status`(= `npx supabase status`)** 또는 **`npm run db:start` 출력** 에서 확인합니다.

| 변수 | 출처(`supabase status`) | 설명 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `API URL` | 브라우저 노출 가능 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon key` | 브라우저 노출 가능(RLS가 데이터 보호) |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role key` | **서버 전용**, 클라이언트 노출 금지. PR1 앱에서는 미사용(이후 관리자/seed 툴링용) |

---

## 데이터베이스 (마이그레이션 & seed)

모두 git으로 버전관리되며 `npm run db:start` / `npm run db:reset` 시 적용됩니다.

```
supabase/
├── config.toml                         # 로컬 스택 설정(포트, seed 경로, auth) — CLI 2.x 호환
├── seed.sql                            # 공통수학1 · 다항식: 개념 15개 + 선수관계
└── migrations/
    ├── 0001_init.sql                   # 전체 테이블 (PLAN.md §7)
    ├── 0002_rls.sql                    # RLS: public-read vs 사용자 전용
    └── 0003_profiles_trigger.sql       # auth.users → profiles 자동 생성
```

스키마/seed를 다시 적용하려면:

```bash
npm run db:reset     # = npx supabase db reset (마이그레이션 재적용 + seed.sql 재실행)
```

RLS 요약:

- public read: `subjects`, `units`, `concepts`, `concept_prerequisites`, 그리고 `reviewed = true`인 `problems`
- 본인만 접근: `profiles`, `learning_sessions`, `attempts`, `concept_mastery`, `growth_snapshots`
- 미검수 `problems`는 어떤 정책도 노출하지 않으므로 `service_role`만 접근 가능(관리자 검수 UI는 PR2)

> `npm run db:start`가 `config.toml`의 필드를 인식하지 못하면 CLI 버전 차이일 수 있습니다. 그 경우 `config.toml`을 지우고 `npx supabase init`으로 재생성한 뒤, 로컬 개발 편의를 위해 `[auth.email] enable_confirmations = false`만 다시 설정하세요. Postgres 버전 이미지가 없다는 오류가 나면 `[db] major_version`을 낮춰보세요(예: 15).

---

## 관리자 검수 파이프라인 (PR2)

학생에게는 `reviewed=true` 문제만 노출됩니다. 문제는 **AI 초안 → import(`reviewed=false`) → 관리자 승인** 흐름으로 만들어집니다.

### 관리자 지정
관리자는 `public.admin_users` 테이블로 관리합니다(자기 승격 불가). Supabase Studio(<http://127.0.0.1:54323>) 또는 psql로:

```sql
insert into public.admin_users (user_id) values ('<auth.users.id 값>');
```

### 관리자 화면
- `/admin` — 검수 대시보드(개념별 reviewed/pending, 목표 진행도)
- `/admin/import` — JSON 붙여넣기 import(멱등: 같은 `import_key` 재import는 draft만 갱신하고 승인본은 보호)
- `/admin/review` — 미검수 목록 → 승인(`reviewed=true`) / 반려(삭제) / 편집 후 승인

### 콘텐츠 import (로컬 스크립트)
초안은 `content/problems/*.json`에 둡니다(`source:"ai"`, `import_key` 필수). 일괄 import는 관리자 전용 RPC `public.import_problems(jsonb)`만 호출하며 결과는 항상 `reviewed=false`입니다.

```bash
# 값은 `npx supabase status -o env` 참고. 키는 절대 커밋하지 마세요.
SUPABASE_ANON_KEY=<anon> ADMIN_EMAIL=<관리자 이메일> ADMIN_PASSWORD=<비밀번호> \
  node scripts/import-problems.mjs
```

### 재현 가능한 reviewed seed (`db:reset` 후에도 30개 이상)
승인된 문제를 `supabase/seed_problems.sql`로 덤프해 커밋하면 `db:reset` 후에도 재현됩니다.

```bash
SUPABASE_ANON_KEY=<anon> node scripts/dump-reviewed.mjs   # supabase/seed_problems.sql 생성
npm run db:reset                                          # seed.sql → seed_problems.sql 순서로 적용
```

`config.toml`의 `[db.seed] sql_paths`가 `seed.sql`(개념) 다음에 `seed_problems.sql`(승인 문제)을 적용합니다.

### 정답 표기 / 채점 정책 경계
- PR2는 `answer`를 **canonical answer**(대표 정답) 문자열로 **저장만** 합니다.
- `expression` 동치식 비교, 공백·항·인수 순서 정규화, `O/X` 입력 정규화(`o`, `O`, `ㅇ`, `예` 등 허용)는 **PR3 채점 정책**에서 다룹니다.
- 즉, PR2의 책임 범위는 **검수 → 승인 → seed 재현 파이프라인**까지이며, 실제 채점/정답 매칭 로직은 포함하지 않습니다.

---

## 프로젝트 구조

```
app/
├── layout.tsx           # 루트 레이아웃 (메타데이터)
├── page.tsx             # "/" → /dashboard 리디렉트
├── login/
│   ├── page.tsx         # 이메일/비밀번호 로그인·회원가입 폼
│   └── actions.ts       # signIn / signUp / signOut (Server Actions)
└── dashboard/
    └── page.tsx         # 인증 가드 + seed concept 개수(빈 상태)
lib/
├── supabase/
│   ├── client.ts        # 브라우저용 Supabase 클라이언트 (PR3+)
│   └── server.ts        # 서버용 Supabase 클라이언트 (async cookies)
├── adaptive/index.ts    # 숙련도 엔진 타입 골격 (PLAN §5.1, 구현 PR3)
├── scheduler/index.ts   # SM-2-lite 스케줄러 타입 골격 (PLAN §5.2, 구현 PR3)
└── graph/index.ts       # 프런티어 추천 타입 골격 (PLAN §5.3, 구현 PR4)
proxy.ts                 # Next 16 Proxy(구 Middleware): 세션 갱신 + 라우트 가드
supabase/                # 위 "데이터베이스" 참고
```

---

## 스크립트

```bash
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드
npm run start      # 빌드 결과 실행
npm run lint       # ESLint
npm run db:start   # 로컬 Supabase 기동 (Docker 필요)
npm run db:status  # 로컬 Supabase 상태/접속 정보
npm run db:reset   # 마이그레이션 재적용 + seed 재실행
npm run db:stop    # 로컬 Supabase 중지
```

---

## 참고

- Supabase CLI는 전역 설치 없이 **devDependency**로 포함되어 `npx supabase ...` 또는 `npm run db:*`로 실행합니다(이 PC에서 winget/scoop이 PATH에 없어 선택한 방식).
- Next.js 16에서 `middleware.ts`는 **`proxy.ts`** 로 이름이 바뀌었습니다(기능 동일).
- 로컬 Supabase는 이메일 인증을 끈 상태(`config.toml`)라 회원가입 직후 바로 로그인됩니다. 확인 메일이 필요한 경우 Inbucket(<http://127.0.0.1:54324>)에서 볼 수 있습니다.
