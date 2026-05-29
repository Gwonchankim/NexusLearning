# RELEASE_CHECKLIST.md — Staging Release Readiness

EduHelp_AI를 **Staging(로컬/스테이징)에서 배포 가능 상태인지 검증**하기 위한 재사용 체크리스트입니다. PR1~PR6 + 보안 하드닝(0006)이 `main`에 반영된 상태를 기준으로 합니다.

> **이 문서의 범위**: Staging readiness 검증. **production 실제 배포가 아닙니다.**
> production 배포 전 확인 항목은 맨 아래 [Production handoff](#production-handoff-실제-배포-전-문서-레벨-안내) 섹션에 **문서 레벨 안내**로만 정리합니다(이 체크리스트는 원격 env·원격 DB·배포를 직접 수행하지 않습니다).

각 항목은 `[ ]`로 두고, 통과 시 `[x]`로 표시합니다. Docker가 꺼져 있으면 DB/Auth가 필요한 항목은 **보류(HELD)** 로 명시합니다.

---

## 1. 사전 조건 (Prerequisites)

- [ ] **Docker Desktop** 설치·실행 중 (`docker info` 성공). 미실행이면 §4~§7은 보류.
- [ ] Node.js 20+ (`node --version`)
- [ ] `npm install` 완료 (Supabase CLI는 devDependency로 함께 설치됨, `npx supabase --version` 확인)
- [ ] `.env.local` 존재 + 값 채움 (`npm run db:status`/`npm run db:start` 출력 기준)
  - `NEXT_PUBLIC_SUPABASE_URL` — `API URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — `anon key`
  - `SUPABASE_SERVICE_ROLE_KEY` — `service_role key` (**서버 전용**)
- [ ] **service-role 키는 server-only**: `NEXT_PUBLIC_` 접두사 없음, 클라이언트/브라우저에 노출 금지, `.env.local`은 커밋 금지
- [ ] `.env.local`·service-role 키 값을 **로그/PR/문서에 출력하지 않음**

---

## 2. Repo hygiene checks

```bash
git status -sb          # working tree clean, main...origin/main 동기화
git diff --check        # whitespace/conflict 마커 없음
```

- [ ] 현재 브랜치/대상 브랜치 확인 (`main` 기준)
- [ ] working tree clean (의도한 문서 변경 외 변경 없음)
- [ ] `.gitignore`가 `.env*`를 무시하고 `.env.example`만 추적 — `git status`에 `.env.local`이 보이지 않음
- [ ] secrets 미커밋: `git log` / 스테이징 diff에 anon/service_role 키 문자열 없음

---

## 3. App build & static checks (Docker 불필요)

```bash
npm run test            # Vitest 단위테스트
npm run lint            # ESLint
npm run build           # next build (TypeScript 포함)
```

- [ ] `npm run test` — 전부 통과 (grading / adaptive / scheduler / session / graph / growth)
- [ ] `npm run lint` — 경고/에러 없음
- [ ] `npm run build` — 컴파일 + TypeScript 통과, 라우트 생성 정상

---

## 4. Local DB reset & seed checks (Docker 필요)

```bash
npm run db:start        # 스택 기동 (migrations 0001~0007 + seed.sql + seed_problems.sql)
npm run db:status       # API URL / anon / service_role 출력 확인
npm run db:reset        # 마이그레이션 재적용 + seed 재실행 (재현성 확인)
```

- [ ] `db:start`/`db:reset` 성공, 마이그레이션 **0001~0007** 모두 적용
- [ ] `seed.sql`(개념 15개 + 선수관계) → `seed_problems.sql`(reviewed 문제) 순서로 seed 적용
- [ ] reviewed 문제가 30개 이상인지 확인. 부족하면 재현 seed를 다시 덤프:
  ```bash
  # service_role 필수 (anon로는 answer 컬럼을 못 읽음). 키는 절대 커밋·출력 금지.
  SUPABASE_SERVICE_ROLE_KEY=<service_role> node scripts/dump-reviewed.mjs
  ```
- [ ] Supabase Studio(<http://127.0.0.1:54323>)에서 concept 15개·seed 문제 확인

---

## 5. Security / RLS checks (Docker 필요)

`npm run db:status`의 anon/service_role 키로 REST를 직접 호출해 확인합니다. **키 값은 출력하지 말 것.**

| # | 대상 | 호출 주체 | 기대 결과 |
|---|------|-----------|-----------|
| - [ ] | `concepts`, `subjects`, `units`, `concept_prerequisites` | anon | 200, 행 반환 (public read) |
| - [ ] | `problems_public` 뷰 | anon | 200, **안전 컬럼만**(`id, concept_id, stem, choices, difficulty, answer_type, reviewed, created_at`) — `answer/solution/wrong_feedback` 없음 |
| - [ ] | base `problems` (`?select=answer`) | anon | 거부 (권한 없음 / 컬럼 없음) — 정답이 노출되면 **실패** |
| - [ ] | `profiles`/`learning_sessions`/`attempts`/`concept_mastery`/`growth_snapshots` | anon | 거부 (본인 전용) |
| - [ ] | `attempts` 등 본인 데이터 | authenticated(본인) | 200, 본인 행만 |
| - [ ] | `analytics_events` 직접 read/write | anon·authenticated | 거부 (RLS 정책 0개로 잠금) |
| - [ ] | `rpc/log_event` | authenticated | 200(허용 이벤트·props), anon은 거부 |
| - [ ] | `rpc/log_event` (화이트리스트 외 key/enum) | authenticated | 거부 (props 검증) |
| - [ ] | `rpc/report_metrics` | service_role만 | service_role 200, anon/authenticated 거부 |
| - [ ] | `admin_users` | anon·authenticated | 거부 (RLS 잠금, 자기 승격 불가) |

- [ ] 정답/풀이 채점은 서버측에서만(`submitAttempt` → `lib/supabase/admin.ts`의 service_role 경로). 클라이언트 payload·응답에 제출 전 `answer` 없음
- [ ] `import_problems` RPC는 `is_admin()` 통과 시에만 성공, anon 실행 거부

> 위 항목은 마이그레이션 0002(RLS) / 0004(admin) / 0006(answer 하드닝) / 0007(analytics)에 근거합니다.

---

## 6. App browser smoke checks (Docker + dev 서버 필요)

```bash
npm run dev             # http://localhost:3000
```

해피패스(로컬은 이메일 인증 비활성이라 회원가입 즉시 세션 발급):

- [ ] `/login` — 회원가입(이메일/비밀번호 6자+) → `/dashboard`로 리디렉트
- [ ] `/onboarding` — 학년(기본 고1)·목표 입력 → "미니 진단 시작" → `/learn`
- [ ] `/learn` — 문제 풀이 → **서버 채점** 즉시 피드백(정오답·풀이·숙련도 변화·다음 복습일)
- [ ] 세션 종료 — "결과 보기" → **성장 페이오프**(개념별 Before→After, 성장 헤드라인, 다음 복습 예고)
- [ ] `/dashboard` — 오늘의 성장·스트릭·오늘의 퀘스트·최근 변화·지식맵·추천 카드 표시
- [ ] **추천 CTA** — "이 개념 학습"(frontier) 또는 "복습 시작"(fallback) → `startConceptSession` → `/learn`
- [ ] **퀘스트 CTA** — "오늘의 퀘스트" 항목 "시작" → `startQuestSession` → `/learn`

> **Playwright/MCP 한계**: 로컬은 `enable_confirmations=false`라 자동화 가능하나, 이메일 인증이 켜진 환경에서는 브라우저 자동화가 인증 링크를 클릭할 수 없습니다. 대안: (a) 로컬 Inbucket(<http://127.0.0.1:54324>)에서 메일 확인, (b) service_role로 테스트 유저를 직접 시드, (c) **데이터 레벨 대체** — `report:metrics`/Studio로 세션·이벤트 적재를 직접 확인. 자동화가 막히면 위 항목은 수동으로 수행하고 그 사실을 보고에 명시.

---

## 7. Metrics / report checks (Docker 필요)

```bash
# service_role 필요. 키는 출력·커밋 금지. window는 ISO, KST 경계는 +09:00로 지정.
SUPABASE_SERVICE_ROLE_KEY=<service_role> \
  npm run report:metrics -- --from <ISO> [--to <ISO>]
```

- [ ] `report:metrics` 실행 성공 (`report_metrics` RPC 호출, 401/권한오류 없음)
- [ ] 출력 4개 섹션 확인:
  - **Loop completion** — started/completed/rate (all·diagnostic·practice)
  - **CTA conversion** — clicks(total·recommendation_clicked·quest_started) / converted / rate
  - **Funnel** — signups → onboarded → completed_at_least_one
  - **Retention** — cohort_day·cohort_size·d1(_mature)·d7(_mature) (미성숙 코호트는 `—`)
- [ ] `--from` 미지정 시 "첫 이벤트 시각부터" 경고 인지 (PR6 이전 `source` 세션과 혼선 방지 위해 명시 권장)

---

## 8. Known local gotchas

- [ ] **db:reset/재기동 직후 auth·kong 502**: 컨테이너가 healthy 되기 전 REST/Auth가 일시적으로 502를 반환할 수 있음.
  - 복구: `npm run db:status`로 ready 확인 후 15~30초 대기 → 재시도. 지속되면 `npm run db:stop` → 5초 대기 → `npm run db:start`(30초+ 대기).
- [ ] **config.toml 미인식**: `db:start`가 필드를 못 읽으면 CLI 버전 차이. README "데이터베이스" 노트의 재생성 절차 참고(재생성 시 `[auth.email] enable_confirmations=false` 재설정).
- [ ] **Windows/PowerShell**: env 주입은 `$env:SUPABASE_SERVICE_ROLE_KEY="<...>"; node scripts/...` 형식. 키를 셸 히스토리/로그에 남기지 않도록 주의.
- [ ] **Docker 미실행**: §4~§7은 전부 보류. 보고서에 "Docker 미실행으로 보류"로 명시.

---

## 9. Pass / Fail 기준

**PASS** (Staging ready):
- §1~§3 전부 통과 (사전조건·hygiene·build/test/lint)
- Docker 가동 시 §4~§7 전부 통과, 특히 §5의 **answer/solution 비노출**과 §6 해피패스 완주
- secrets 미노출·미커밋

**HELD** (조건부): Docker 미실행으로 §4~§7 미수행 — §1~§3만으로는 **부분 통과**. DB/RLS/smoke/metrics는 Docker 환경에서 재검증 필요.

**FAIL**:
- §5에서 anon이 `answer/solution`을 읽을 수 있음, 또는 RPC 권한 경계 위반
- build/test/lint 실패
- secrets가 커밋·출력됨

---

## Production handoff (실제 배포 전 — 문서 레벨 안내)

> 이 체크리스트는 **원격 env·원격 DB·배포를 직접 수행하지 않습니다.** 아래는 실제 production 배포 담당자가 별도로 확인해야 할 항목의 안내입니다.

- [ ] **Vercel(또는 호스팅) 환경변수**:
  - `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY` — production Supabase 값
  - `SUPABASE_SERVICE_ROLE_KEY` — **server env로만** 설정(`NEXT_PUBLIC_` 금지, 빌드 로그/클라이언트 번들 미포함 확인)
- [ ] **원격 Supabase migrations**: 0001~0007이 production DB에 적용되었는지 확인(`supabase db push` 등은 담당자가 별도 승인 후 수행)
- [ ] **RLS 재검증**: production에서도 §5 매트릭스(특히 answer 비노출)를 재확인
- [ ] **Auth 설정**: production은 이메일 인증 정책을 환경에 맞게(로컬의 `enable_confirmations=false`는 dev 전용)
- [ ] **seed 정책**: production에 dev seed/테스트 유저가 유입되지 않는지 확인
- [ ] **롤백 계획**: 배포 실패 시 직전 상태로 되돌릴 절차 확인

---

_갱신 시: 마이그레이션·env·스크립트가 추가되면 §4·§5·§7과 §1을 함께 업데이트하세요._
