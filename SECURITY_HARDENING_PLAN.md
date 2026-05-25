# 보안 하드닝 PR — answer/solution/wrong_feedback DB 노출 차단

> PR1~PR5와 별개인 **번호 없는 보안 하드닝 PR**. 브랜치: `pr-answer-hardening` (from `main` da0dc0c).

## Objective
reviewed 문제의 `answer/solution/wrong_feedback`를 **DB/REST 레벨에서 학생·anon이 직접 읽지 못하도록** 차단한다. 채점은 기존 **TS `lib/grading`** 유지, 정답 read는 **서버 전용 service-role 경로**로만. 관리자/seed/import/학습 흐름은 무손상.

PR3·PR4에서 "후속 보안 PR"로 미뤄둔 과제(당시 `problems_read_reviewed` RLS가 reviewed 행의 전체 컬럼을 anon/authenticated에 노출)를 해결한다.

## 노출 경로 & 위험 (Before)
- `0002_rls.sql`의 `problems_read_reviewed` 정책: `for select to anon, authenticated using (reviewed = true)` → reviewed 행의 **모든 컬럼**(answer/solution/wrong_feedback 포함)을 노출.
- 공격면: `GET /rest/v1/problems?select=answer&reviewed=eq.true` 를 anon 키로 호출하면 정답을 그대로 덤프 가능. 앱 payload 보호(PR3)는 우회됨.

## 설계 (A + C, 확정)
- **A. `problems_public` 뷰**: 학생/anon의 유일한 문제 read 경로. 안전 컬럼만 노출.
- **C. 서버 전용 service-role**: 채점 시 정답 read는 `lib/supabase/admin.ts`의 service-role 클라이언트로만. TS 채점 유지(SQL 채점 재구현 금지).
- (B. SQL RPC 채점 재구현은 기각 — TS 테스트 손실 + 표현식 정규화 리스크.)

### 원칙 갱신
"service_role 미사용" → **"클라이언트/브라우저 경로 미사용, 서버 전용 격리 사용"**.

### server-only 가드 결정 (의존성 0)
- `server-only` 패키지는 `next`의 선언 의존성이지만 **현재 lockfile/node_modules에 미설치**(`require.resolve` 실패)라 `import 'server-only'`는 빌드를 깬다.
- → `server-only` 패키지 **미설치 / `import 'server-only'` 미사용 / 신규 의존성 0 유지**.
- 대신 `lib/supabase/admin.ts`에 **런타임 가드 + import 위생**으로 서버 전용 경계 유지:
  1. 모듈 로드 시 `if (typeof window !== 'undefined') throw` (브라우저 평가 시 즉시 실패),
  2. `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` 누락 시 명확한 throw,
  3. import 위생: 서버 액션/스크립트에서만 import (Client Component 미import, grep 검증).
- 근거: `SUPABASE_SERVICE_ROLE_KEY`는 `NEXT_PUBLIC_` 접두사가 없어 Next가 클라이언트 번들에 인라인하지 않음 → 키 누출 경로는 env 규칙상 이미 차단.

## 구현 범위

### DB — `supabase/migrations/0006_problem_answer_hardening.sql`
- `create view public.problems_public as select id, concept_id, stem, choices, difficulty, answer_type, reviewed, created_at from public.problems where reviewed;` (answer/solution/wrong_feedback **제외**).
- `revoke all on public.problems_public from anon, authenticated;` → `grant select on public.problems_public to anon, authenticated;` (Supabase가 새 뷰에 ALL을 자동 grant하는데, 단순 뷰는 auto-updatable이고 소유자=postgres라 쓰기가 RLS를 우회해 base를 변조할 수 있으므로 **SELECT만 남기고 쓰기 권한 회수**).
- `drop policy "problems_read_reviewed" on public.problems;` (admin 정책 4종 유지).
- `revoke select on public.problems from anon;` (defense-in-depth; authenticated는 admin RLS용 grant 유지).

### 앱 코드
- **`lib/supabase/admin.ts`** (신규): 런타임 가드 + `@supabase/supabase-js`(기존 의존성) `createClient(url, serviceKey, {auth:{persistSession:false,autoRefreshToken:false}})`.
- **`app/learn/actions.ts` `submitAttempt`**: 세션 소유/ended/중복/세션내 검증을 **user client로 먼저** 완료한 뒤에만, admin client로 problem(answer/answer_type/choices/concept_id/difficulty/solution/wrong_feedback, `.eq('reviewed',true)`) read → 채점. attempts insert·concept_mastery upsert는 user client(RLS self) 유지.
- **`app/learn/page.tsx`·`app/learn/create-session.ts`**: `from('problems')` → `from('problems_public')`.
- **`scripts/dump-reviewed.mjs`**: `SUPABASE_SERVICE_ROLE_KEY` 필수(anon로는 answer read 불가) — 누락 시 명확한 에러.
- **admin(review/page·actions, page)·`import_problems` RPC**: 변경 없음.

### 문서 — `README.md`
- env 표: `SUPABASE_SERVICE_ROLE_KEY` = 서버 전용, 서버 채점+seed 덤프 사용, 배포 시 서버 env만, `NEXT_PUBLIC_` 금지, `.env.local` 미커밋.
- RLS 요약: public read는 `problems_public` 뷰; base `problems`는 학생/anon 미노출.
- dump-reviewed 사용 예시 service-role로 갱신.
- PR3/PR4의 "후속 과제" 노트 → "0006에서 해결"로 갱신.
- 신규 "보안 하드닝" 섹션(뷰/service-role/키 취급/server-only 경계/seed 덤프).

## Verification (실측 결과)
- **migration**: db:reset 적용 OK. 뷰 컬럼 8개(민감 컬럼 0). 정책 = `problems_admin_*`만(`problems_read_reviewed` 제거). 뷰 41행 = base reviewed 41.
- **뷰 권한**: anon/authenticated = `SELECT`만(ins/upd/del = false), service_role 유지. (auto-updatable 뷰의 쓰기 회수 확인.)
- **base 권한**: anon → base `problems` permission denied; authenticated 비-admin → base 0행(RLS) / 뷰 41행.
- **REST 매트릭스(anon)**: `problems?select=answer` → 42501 denied; `problems_public?select=*` → 안전 컬럼만; count 41; `problems_public?select=answer` → 42703 컬럼 없음. service_role → base answer read OK(채점 경로 검증).
- **위생**: admin.ts 코드 importer = `app/learn/actions.ts`(`'use server'`)뿐, Client Component 미import. `SUPABASE_SERVICE_ROLE_KEY`는 admin.ts/dump-reviewed.mjs/README/.env.example에만.
- **회귀**: test 79/79, lint clean, build OK. `package.json`/`package-lock.json` 무변경(의존성 0). `.env.local` 미추적.

## 범위 밖 / 후속
- 레이트리밋·감사로그·기타 테이블 하드닝·"숙달 후 풀이 공개" 기능·SQL 채점 재구현·PR6 계측.
- 로컬 런타임: `submitAttempt`는 `.env.local`에 `SUPABASE_SERVICE_ROLE_KEY` 추가 후 동작(서버 전용, 커밋 금지).

## 진행 제약
commit/push/PR은 구현·검증 보고 후 **승인 대기**. Co-Authored-By 생략.
