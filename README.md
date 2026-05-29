# EduHelp_AI

고1 수학(공통수학1 · 다항식) 학습 MVP. "어제보다 나아졌다"고 느끼는 성장 체감 루프를 검증하는 것이 목표입니다. 전체 전략·범위·데이터 모델·빌드 순서는 [`PLAN.md`](./PLAN.md)를 참고하세요.

스택: **Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres · Auth · RLS)**

> 현재 단계는 **PR6 (계측) 완료** 입니다. PR5 성장 페이오프·오늘 할 일 위에 **루프 완주/CTA 전환/D1·D7 리텐션 계측**(`analytics_events` + `report_metrics`)이 더해졌고, 보안 하드닝(0006)으로 `answer/solution`의 DB/REST 노출을 차단했습니다. AI 실시간 생성·결제·캐릭터는 아직 포함되어 있지 않습니다. Staging 배포 가능 여부는 [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md)로 검증하고, production 배포 절차는 [`PRODUCTION_HANDOFF.md`](./PRODUCTION_HANDOFF.md)를 따릅니다.

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
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role key` | **서버 전용**(브라우저/클라이언트 노출 금지). 서버 채점(`submitAttempt`의 정답 조회)과 seed 덤프에 사용. 배포 시 **서버 환경변수로만** 설정(예: Vercel server env), `NEXT_PUBLIC_` 접두사 금지, `.env.local`은 커밋 금지 |

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
    ├── 0003_profiles_trigger.sql       # auth.users → profiles 자동 생성
    ├── 0004_admin_review.sql           # 관리자 검수: admin_users · is_admin() · import_problems
    ├── 0005_attempts_submitted_answer.sql  # attempts.submitted_answer 컬럼
    ├── 0006_problem_answer_hardening.sql    # problems_public 뷰 + answer/solution DB 노출 차단
    └── 0007_analytics_events.sql       # analytics_events · log_event · report_metrics
```

스키마/seed를 다시 적용하려면:

```bash
npm run db:reset     # = npx supabase db reset (마이그레이션 재적용 + seed.sql 재실행)
```

RLS 요약:

- public read: `subjects`, `units`, `concepts`, `concept_prerequisites`, 그리고 `problems_public` 뷰(`reviewed` 행의 **안전 컬럼만** — `answer/solution/wrong_feedback` 제외)
- 본인만 접근: `profiles`, `learning_sessions`, `attempts`, `concept_mastery`, `growth_snapshots`
- base `problems`는 학생/anon에게 노출되지 않습니다(0006). 관리자만 RLS(`is_admin()`)로 읽고, 앱 서버는 채점 시 `service_role`로만 정답을 읽습니다. 미검수 행도 `service_role`/관리자만 접근(검수 UI는 PR2)

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
SUPABASE_SERVICE_ROLE_KEY=<service_role> node scripts/dump-reviewed.mjs   # supabase/seed_problems.sql 생성 (answer 포함 — service_role 필수)
npm run db:reset                                          # seed.sql → seed_problems.sql 순서로 적용
```

`config.toml`의 `[db.seed] sql_paths`가 `seed.sql`(개념) 다음에 `seed_problems.sql`(승인 문제)을 적용합니다.

### 정답 표기 / 채점 정책 (PR3 구현)
- `answer`는 **canonical answer**(대표 정답) 문자열로 저장하고, 채점은 항상 **서버측**에서 수행합니다(`lib/grading`).
- 답안 유형별 최소 정규화:
  - `multiple_choice` — 공백 무시 후 정답 비교
  - `short_answer` — 공백 정리 후 비교(숫자는 그대로). 정답이 O/X면 `O,o,ㅇ,예,yes,true,1,참`→O / `X,x,아니오,아니요,no,false,0,거짓`→X 정규화
  - `expression` — **제한적 항/인수 순서 정규화**(공백 제거 + top-level 합 항 순서 + top-level 곱 인수 순서 + 괄호 내 단순 다항식 항 순서). 파싱 실패 시 공백만 제거해 비교
- **한계**: `expression`은 전개식↔인수분해식 동치(예: `(x+3)(x+4)` vs `x^2+7x+12`)나 `(x+3)^2` vs `(x+3)(x+3)` 같은 **대수적 동치는 인정하지 않습니다**. 완전 동치 판정(CAS)은 후속 PR 과제입니다.

---

## 학습 루프 (PR3)

온보딩 미니 진단으로 초기 숙련도를 만들고, 학습 세션에서 푼 결과로 숙련도(EWMA)와 다음 복습일(SM-2-lite)이 갱신됩니다.

- `/onboarding` — 학년·목표 입력 → 5~7문제 미니 진단(`mode=diagnostic`) → 초기 `concept_mastery` 시드
- `/learn?sessionId=...` — 세션 문제를 1개씩 풀이 → **서버측 채점** → 즉시 피드백(정오답·풀이·숙련도 변화·다음 복습일). 세션 생성은 **명시적 Server Action**(`startPracticeSession`/`startDiagnosticSession`)에서만 이뤄지며, `/learn` 새로고침은 같은 세션을 이어서 풉니다(새 세션 생성 안 함).
- `/dashboard` — 개념별 숙련도 개요 + 복습 도래 수 + "학습 세션 시작". 진행 데이터가 없으면 온보딩으로 안내합니다.

엔진은 순수 함수로 분리되어 `npm run test`(Vitest)로 검증합니다: `lib/adaptive`(EWMA α=0.3, 망각 decay λ=0.035), `lib/scheduler`(복습 간격 1→3→7→16일, 오답 시 1일 리셋 + ease 감소), `lib/grading`, `lib/session/select`.

> **보안 범위(중요)**: PR3는 학습 세션이 클라이언트로 보내는 payload에서 `answer/solution`을 제외하고 채점을 서버에서 수행합니다. 당시 `problems_read_reviewed` RLS가 reviewed 문제의 `answer/solution` 컬럼을 여전히 노출하던 문제는 **보안 하드닝(0006)에서 해결**되었습니다 — 아래 "보안 하드닝" 섹션 참고.

---

## 지식맵 & 추천 (PR4)

대시보드에서 선수관계 DAG(공통수학1·다항식 15개념)를 경량 SVG 지식맵으로 보여주고, `effectiveMastery` 기반 **frontier 추천**으로 "다음 학습 개념"을 제시합니다. DB 마이그레이션·신규 의존성은 없습니다.

- **개념 상태(4단계)**: `locked`(선수 미충족) · `available`(선수 충족·미학습) · `in_progress`(학습 중) · `mastered`(숙련도 ≥ 0.7). 모두 망각 decay가 반영된 `effectiveMastery` 기준입니다.
- **frontier**: 선수개념이 모두 기준 이상이고 자신은 아직 기준 미만인 개념(= `available` + `in_progress`). 정렬은 선수 충족도↓ → 자기 숙련도↑ → 복습 도래 → `order_index`.
- **추천 카드 = 유일한 학습 진입점**: top-1 개념을 추천합니다. frontier가 있으면 "이 개념 학습", 모두 숙달해 비어 있으면 복습 대상(복습 도래 우선 → 최저 숙련도)을 "복습 시작"으로 제시합니다. 지식맵 노드 자체는 클릭 동작이 없고 상태 이해용입니다.
- **`startConceptSession(conceptId)`**: 추천 CTA가 호출하는 Server Action. 클라이언트가 보낸 `conceptId`를 서버에서 다시 검증(`lib/graph`의 `isStartable`)해 `locked`/비추천을 거부하고, 해당 개념만 출제하는 focus 세션을 만들어 `/learn`으로 이동합니다.
- **평균 숙련도 카드 vs 지식맵**: 평균 숙련도 카드는 **학습한 개념**(`concept_mastery` 행이 있는 개념)만의 평균이고, 지식맵은 **전체 15개념**의 상태를 보여줍니다 — 분모가 다릅니다.

순수 로직은 `lib/graph`(Vitest)로 검증합니다. 시각화는 의존성 없이 SVG/CSS로 구현했고 **React Flow는 도입하지 않았습니다**(후속 고도화 후보). `answer/solution`의 DB 레벨 컬럼 보호는 **보안 하드닝(0006)에서 해결**되었습니다(아래 "보안 하드닝" 섹션).

---

## 성장 페이오프 & 오늘 할 일 (PR5)

학습이 끝난 직후의 **성장 체감**과 **매일 돌아올 이유**를 더합니다. 모든 성장 수치는 **서버에서 계산**하고, 날짜 경계는 **KST(Asia/Seoul, 고정 +9h)** 기준입니다. **DB 마이그레이션·신규 의존성은 없습니다**(시각화는 경량 SVG).

- **세션 종료 페이오프**(완료 화면): 개념별 **Before→After 게이지**, **성장 헤드라인**(`이해도 +N%p`; 0/음수는 "기반을 유지/다졌어요"로 순화), **다음 복습 예고**.
- **오늘의 성장**: 오늘(KST) 완료 세션들의 숙련도 변화 합(%p). 음수는 숫자 강조 없이 순화.
- **스트릭**: 완료 세션이 있는 날의 연속 일수(KST).
- **오늘의 퀘스트**: 신규 2 + 복습 3(가용량에 따라 가변, `locked` 제외). 미완 항목은 `startQuestSession`으로 해당 개념 학습을 시작합니다.
- **최근 변화**: 최근 7개 완료 세션의 성장 델타를 경량 SVG 스파크라인으로 표시.
- **성장 수치 정의**: `sessionMasteryDelta` = 그 세션에서 실제로 푼 개념들의 `effectiveMastery` 변화(after−before)의 **부호 있는 평균**(없으면 null → 헤드라인 생략). 세션 시작 시 `learning_sessions.summary.startMastery` 스냅샷을 저장해 서버가 종료 시 비교합니다.
- 순수 로직(KST·스트릭·퀘스트·델타)은 `lib/growth`(Vitest)로 검증합니다. `growth_snapshots` 일별 영속화·장기 성장곡선은 후속 PR 과제입니다.

---

## 보안 하드닝 — answer/solution DB 노출 차단 (0006)

reviewed 문제의 `answer/solution/wrong_feedback`를 **DB/REST 레벨에서 학생·anon이 직접 읽지 못하도록** 잠갔습니다. 채점은 그대로 서버측 `lib/grading`(TS)로 수행합니다.

- **`problems_public` 뷰**: 학생/anon의 유일한 문제 read 경로. `id, concept_id, stem, choices, difficulty, answer_type, reviewed, created_at`만 노출하고 `answer/solution/wrong_feedback`은 **포함하지 않습니다**. anon/authenticated에는 `SELECT`만 부여하고 쓰기 권한은 회수합니다(단순 뷰의 auto-update로 base가 변조되지 않도록).
- **base `problems`**: `problems_read_reviewed` 정책 제거 + anon `SELECT` 권한 회수. 이제 관리자(`is_admin()` RLS)와 `service_role`만 base를 읽습니다.
- **서버 전용 정답 조회**: `submitAttempt`는 세션 소유/ended/중복/세션내 검증을 **user client로 먼저** 끝낸 뒤에만, `lib/supabase/admin.ts`의 `service_role` 클라이언트로 정답/풀이를 읽어 채점합니다. `solution/wrong_feedback`는 제출 후 응답으로만 전달됩니다.
- **service-role 키 취급**: `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 — 브라우저 노출 금지, 배포 시 서버 환경변수로만 설정(예: Vercel server env), `.env.local`은 커밋 금지. `NEXT_PUBLIC_` 접두사가 없으므로 Next가 클라이언트 번들에 인라인하지 않습니다.
- **server-only 경계**: `server-only` 패키지는 현재 lockfile에 없어 추가하지 않았습니다(신규 의존성 0 유지). 대신 `lib/supabase/admin.ts`는 (1) 모듈 로드 시 `window` 가드(브라우저에서 평가되면 throw), (2) `SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` 누락 시 명확한 throw, (3) import 위생(서버 액션/스크립트에서만 import, Client Component 미import)으로 서버 전용 경계를 유지합니다.
- **seed 덤프**: `scripts/dump-reviewed.mjs`는 이제 `SUPABASE_SERVICE_ROLE_KEY`가 필요합니다(anon로는 `answer`를 읽을 수 없음).

---

## 계측 (PR6)

학습 루프가 실제로 **완주**되는지, 사용자가 **재방문**(D1/D7)하는지, 추천/퀘스트 CTA가 **세션으로 전환**되는지를 측정합니다. 게이트 지표는 대부분 기존 테이블에서 **도출**하고, 도출 불가능한 "클릭 의도"만 이벤트로 기록합니다(신규 의존성 0).

- **`analytics_events`**(0007): funnel 이벤트 2종만 저장 — `recommendation_clicked`, `quest_started`. RLS는 정책 0개로 잠가(anon/authenticated read·direct write 불가) 쓰기는 `log_event()` RPC, 읽기는 `service_role`만(= `admin_users` 패턴).
- **`log_event(p_name, p_props)`**(SECURITY DEFINER): `user_id`를 `auth.uid()`로 강제(위조 불가)하고 **이벤트별 props 화이트리스트**(허용 key·enum·slug만, 그 외 전부 거부)로 PII 유입을 차단. `authenticated`만 실행.
- **`report_metrics(p_from, p_to)`**(SECURITY INVOKER, `service_role` 전용): 집계 jsonb 반환 — `completion`(완주율·mode별)·`cta`(클릭→세션 전환, 동일 window)·`funnel`(signup 코호트 기준)·`retention`(D1/D7).
- **`npm run report:metrics -- --from <ISO> [--to <ISO>]`**: `report_metrics`를 호출해 콘솔 표로 출력. `SUPABASE_SERVICE_ROLE_KEY` 필요(서버 전용·미커밋).

정의/규약:
- **루프 완주** = `learning_sessions.ended_at not null` + `summary.problemCount > 0`.
- **retention** = signup 코호트(분모) 대비 **정확히 N일째**(KST) 완주 활동. 미성숙 코호트(오늘 < 가입일+N)는 `d1_mature`/`d7_mature=false`로 표시하고 D_N은 `—`. `cohort_size` 병기(small-N 주의).
- **CTA 전환** = 클릭(이벤트)과 전환(세션 `summary.source`)을 **동일 window**로 계산. `--from` 미지정 시 첫 이벤트 시각부터 — PR6 이전 `source` 세션과 섞이지 않게 명시 권장. 집계 비율(퍼-클릭 상관 아님).
- **KST**: 리포트 SQL은 `at time zone 'Asia/Seoul'`(앱 TS는 `lib/growth` 고정 +9h; DST 없어 동일 결과).
- **계측 발행**: `lib/analytics/log-event.ts`의 `logEvent()`는 **best-effort awaited telemetry** — await하되 내부 try/catch로 실패를 삼켜 학습 액션을 절대 깨지 않음. 명시적 Server Action에서만 발행(렌더 금지).
- **Privacy**: `props`는 ID/enum/boolean/count만(`conceptId` slug·`source`·`kind`). 원문 답안·`goal`/`grade`·email·문제 `stem`/`solution`/`answer`·IP/UA 저장 금지.

---

## 프로젝트 구조

```
app/
├── layout.tsx           # 루트 레이아웃 (메타데이터)
├── page.tsx             # "/" → /dashboard 리디렉트
├── login/               # 이메일/비밀번호 로그인·회원가입 (page + actions)
├── dashboard/           # 대시보드: page · KnowledgeMap · GrowthCards · RecentSparkline · growth.ts(loadGrowth)
├── onboarding/          # 학년·목표 + 미니 진단 시작 (page + actions)
├── learn/               # 학습 세션: page · LearnSession(client) · actions(submit/end/startConcept/startQuest) · create-session · recommend
└── admin/               # 콘텐츠 검수 파이프라인 (PR2)
lib/
├── supabase/            # 브라우저/서버 Supabase 클라이언트 (server는 async cookies)
├── grading/index.ts     # 답안 채점 — 최소 정규화 (순수, Vitest)
├── adaptive/index.ts    # 숙련도 엔진: EWMA + 망각 decay (PLAN §5.1, 순수, Vitest)
├── scheduler/index.ts   # SM-2-lite 스케줄러 (PLAN §5.2, 순수, Vitest)
├── session/select.ts    # 세션 문제 선정 (순수, Vitest)
├── graph/index.ts       # 선수관계 DAG · frontier 추천 · 상태 분류 (PLAN §5.3, 순수, Vitest)
└── growth/index.ts      # KST·스트릭·오늘의 퀘스트·세션 성장 델타 (PR5, 순수, Vitest)
proxy.ts                 # Next 16 Proxy: 세션 갱신 + 라우트 가드(/dashboard·/admin·/learn·/onboarding)
supabase/                # 위 "데이터베이스" 참고 (migrations 0001~0007 + seed.sql · seed_problems.sql)
```

---

## 스크립트

```bash
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드
npm run start      # 빌드 결과 실행
npm run lint       # ESLint
npm run test       # Vitest 단위테스트 (grading / adaptive / scheduler / session / graph / growth)
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
