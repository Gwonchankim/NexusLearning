# PR2 실행 계획 — 콘텐츠 파이프라인

PR1(기반)에 이어, "AI 초안 → 사람 검수 → 승인" 콘텐츠 파이프라인과 관리자 도구를 만든다. 학생에게는 `reviewed=true` 문제만 노출(PR1 RLS 유지). 본 문서는 승인된 v2 계획 + 결정사항을 반영한 PR2의 확정 계획이다.

## 0. 목표 / 완료 기준(DoD)

- `npm run db:reset` **직후에도** `reviewed=true` 문제 **30개 이상**이 재현된다. (옵션 C)
- 파이프라인 동작: AI 초안 import(`reviewed=false`) → 관리자 UI 승인 → `reviewed=true`. 반려(Reject) = 삭제.
- 관리자 접근은 `public.admin_users` 기반(자기 승격 불가). **앱 코드는 service_role 키를 쓰지 않는다.**
- `npm run lint`, `npm run build`, 브라우저 E2E 통과. README에 절차 문서화.

## 1. 범위

**In**: 콘텐츠 파이프라인 · seed/manual import · 문제 검수 UI · `reviewed` 승인 흐름 · `reviewed=true` 30~50개 확보(재현 가능) · 관리자 접근 · DB/RLS 보강 · 검증

**Out (유지)**: 학습 세션 UI · mastery 엔진 실제 연결 · 지식맵/추천 · 성장 페이오프 · Anthropic 실시간 생성 · 결제/캐릭터/소셜

> 비고: AI "실시간 생성"만 제외. Claude가 작성한 **정적 초안 JSON**을 배치 import하는 것은 허용 범위. 초안은 `source="ai"`, import 직후 `reviewed=false`.

## 2. 확정 결정사항

1. **완료 기준 = 옵션 C**: 초안 JSON → import(`reviewed=false`) → 관리자 UI 승인 → `dump-reviewed` → `supabase/seed_problems.sql` 커밋 → `db:reset`이 `reviewed=true` 재현.
2. **import 충돌 처리 = `ON CONFLICT (import_key) DO UPDATE ... WHERE problems.reviewed = false`**. 승인 전 draft는 JSON 수정 후 재import로 갱신 가능. **이미 `reviewed=true`인 승인본은 덮어쓰지 않음**(WHERE로 보호) → 충돌 시 "skipped/protected"로 보고.
3. **`import_key`**: `problems.import_key text` + **일반 UNIQUE 제약**(partial index 아님). Postgres UNIQUE는 NULL 다중 허용 → import_key 없는 행은 무관, `ON CONFLICT (import_key)`를 predicate 없이 단순 사용.
4. **관리자 = `public.admin_users` 테이블**. `profiles.is_admin` 미사용. 앱 코드 service_role 미사용. service_role / DB direct access는 **로컬 script(import/dump)에서만** 허용, **키는 절대 커밋 금지**.
5. **출처 보존**: Claude 초안 `source="ai"` → `reviewed=false` import → 승인 후에만 `reviewed=true`. `seed_problems.sql`의 승인본도 `source="ai"` 유지.
6. 파일 계획에서 `app/admin/import`는 `page.tsx` + `actions.ts` 한 쌍으로 정리(중복 표기 제거).
7. **정답 표기 / 채점 경계(PR2 범위 고정)**:
   - PR2는 `answer`를 **canonical answer**(대표 정답) 문자열로 **저장만** 한다.
   - `expression` 동치식 비교, 공백·항·인수 순서 정규화, `O/X` 입력 정규화(`o`, `O`, `ㅇ`, `예` 등 허용)는 **PR3 채점 정책**에서 다룬다.
   - 따라서 PR2의 책임은 **검수 → 승인 → seed 재현 파이프라인**까지로 한정한다(실제 채점/정답 매칭은 PR2 범위 밖).

## 3. DB/RLS 보강 — `supabase/migrations/0004_admin_review.sql`

- `public.admin_users (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now())`
  - RLS 활성화 + **정책 0개** → anon/authenticated 접근 전면 차단(자기 승격 불가). 관리자 지정은 Studio/SQL 수동 insert(서버측 권한)로만.
- `public.is_admin()` `SECURITY DEFINER`, `set search_path = public`, `stable`:
  `select exists(select 1 from public.admin_users where user_id = auth.uid())`
- `problems` 정책 추가(기존 `problems_read_reviewed` 유지):
  - `problems_admin_select` (select, `using is_admin()`) — 미검수 포함 전체
  - `problems_admin_insert` (insert, `with check is_admin()`)
  - `problems_admin_update` (update, `using is_admin() with check is_admin()`)
  - `problems_admin_delete` (delete, `using is_admin()`) — Reject
- `problems.import_key text` + `unique (import_key)` (일반 제약)

## 4. 관리자 접근 방식

- `admin_users`에 행이 있는 사용자만 관리자. RLS가 강제 → 앱은 일반 authenticated 클라이언트만 사용(서버 액션에서 admin RLS로 동작).
- 지정(MVP): Supabase Studio 또는 `insert into public.admin_users(user_id) values ('<uid>');` (README 문서화).
- 라우트 가드: `app/admin/layout.tsx`에서 `getUser()` + `is_admin()` 확인 → 비관리자 `/dashboard` 리디렉트. `proxy.ts`에 `/admin` 미인증 차단 추가.

## 5. 콘텐츠 파이프라인 흐름

```
content/problems/polynomials.json  (Claude 작성, source="ai")
        │  scripts/import-problems.mjs (로컬, DB direct)  ─ 또는 ─  /admin/import (UI, admin RLS)
        ▼
problems(reviewed=false)
        │  /admin/review : Approve(→reviewed=true, reviewed_at, reviewer_id) / Reject(delete) / Edit
        ▼
problems(reviewed=true)
        │  scripts/dump-reviewed.mjs (로컬, DB direct)
        ▼
supabase/seed_problems.sql  (reviewed=true, source 유지, reviewer_id=null)  → git commit
        │  npm run db:reset  ([db.seed] sql_paths: seed.sql + seed_problems.sql)
        ▼
reviewed=true ≥ 30 재현  →  학생은 PR1 RLS로 reviewed만 조회
```

## 6. import 동작

- 입력: `content/problems/*.json` 배열. 항목 필드: `import_key, concept_id, stem, choices, answer, solution, wrong_feedback, difficulty, answer_type, source`.
- 멱등: `insert ... on conflict (import_key) do update set <draft fields> where problems.reviewed = false`.
  - draft(미승인): 재import 시 갱신됨.
  - 승인본(`reviewed=true`): WHERE 조건으로 **갱신 안 됨(보호)** → 결과에 skipped/protected 카운트 보고.
- 경로: (a) `scripts/import-problems.mjs` 로컬 일괄(DB direct, `SUPABASE_DB_URL` env), (b) `/admin/import` UI(붙여넣기, admin RLS) — 둘 다 동일 멱등 규칙.

## 7. 검수 UI

- `app/admin/page.tsx`: 개념별 `reviewed`/미검수 카운트 + 총 reviewed 진행도(목표 30 대비).
- `app/admin/review/page.tsx` + `actions.ts`: 미검수 목록(stem/choices/answer/solution/difficulty/concept) →
  - **Approve**: `reviewed=true, reviewer_id=auth.uid(), reviewed_at=now()` (Server Action, admin RLS)
  - **Edit→Approve**: 필드 수정 후 승인
  - **Reject**: 행 삭제(확인)
- `app/admin/import/page.tsx` + `actions.ts`: JSON 붙여넣기 import(멱등).

## 8. `reviewed=true` 30개+ 확보 & 재현 전략 (옵션 C)

1. 15개 개념에 걸쳐 **약 40문항 초안**(`source="ai"`) 작성 → `content/problems/polynomials.json`.
2. import(`reviewed=false`).
3. `/admin/review`에서 승인(파이프라인 검증; 베이스라인은 자동화로 일괄 승인 가능 — 실제 Approve Server Action 경유).
4. `scripts/dump-reviewed.mjs`로 `reviewed=true` 행을 `supabase/seed_problems.sql`로 덤프(소스 보존, `reviewer_id=null`).
5. `supabase/config.toml`의 `[db.seed] sql_paths`에 `./seed_problems.sql` 추가.
6. `npm run db:reset` → taxonomy + reviewed 문제 ≥30 **재현**.

## 9. 파일/디렉터리

```
supabase/migrations/0004_admin_review.sql   # admin_users, is_admin(), problems admin RLS(+delete), import_key unique
supabase/seed_problems.sql                  # 승인본(reviewed=true) — 재현용 (dump 산출물)
supabase/config.toml                        # [db.seed] sql_paths += ./seed_problems.sql (수정)
content/problems/polynomials.json           # AI 초안(source="ai", reviewed=false)
scripts/import-problems.mjs                 # content/*.json → DB(reviewed=false) 멱등 import (로컬, DB direct)
scripts/dump-reviewed.mjs                   # reviewed=true → seed_problems.sql 덤프 (로컬, DB direct)
app/admin/layout.tsx                        # is_admin 가드
app/admin/page.tsx                          # 검수 대시보드(카운트/진행도)
app/admin/review/page.tsx                   # 미검수 목록 UI
app/admin/review/actions.ts                 # approve / reject(delete) / edit Server Actions
app/admin/import/page.tsx                   # JSON 붙여넣기 import UI
app/admin/import/actions.ts                 # import Server Action(멱등)
proxy.ts                                    # /admin 가드 추가 (수정)
README.md                                   # 관리자 지정/검수/import/재현 절차 (수정)
```

> 보안: `scripts/*`는 `SUPABASE_DB_URL`(로컬 `postgresql://postgres:postgres@127.0.0.1:54322/postgres`)을 env로 받아 동작하며 **키/URL을 커밋하지 않는다**. 앱(app/*)은 anon 키 + 사용자 세션 + admin RLS만 사용한다.

## 10. 빌드 순서 (작은 커밋)

1. `PR2_PLAN.md` (본 문서)
2. `migration 0004` 작성
3. `db:reset` + RLS 검증(psql: admin/비admin/학생, admin_users 보호)
4. admin UI / import / review 구현(가드·대시보드·import·approve/reject/edit)
5. 문제 초안 작성 → import → 승인 → `dump-reviewed` → `seed_problems.sql`
6. `db:reset` 후 `reviewed=true ≥ 30` 재현 확인
7. `lint` / `build` / 브라우저 E2E

## 11. 검증 방법

- **RLS/DB(psql + REST)**: 학생=reviewed만 / 비관리자=미검수 select·update·delete 불가 / 관리자=미검수 select·승인·삭제 가능 / 승인 후 `reviewed_at` 채워짐 / `admin_users`는 일반 사용자 조회·수정 불가(자기 승격 불가).
- **멱등성**: import 2회 후 중복 없음; 승인본은 재import에 보호(skipped) 보고.
- **재현성**: `npm run db:reset` 직후 `select count(*) from problems where reviewed;` ≥ 30.
- **브라우저 E2E(레포 밖 임시 Playwright)**: 관리자 로그인 → `/admin/review` 승인 → 미검수에서 제거·reviewed 증가; 비관리자 `/admin` 접근 → 리디렉트.
- **회귀**: `npm run lint`, `npm run build`.
