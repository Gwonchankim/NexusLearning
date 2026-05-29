# PRODUCTION_HANDOFF.md — EduHelp_AI

production 배포를 위한 handoff 문서입니다. PR1~PR6 + 보안 하드닝(0006) + `RELEASE_CHECKLIST.md`가 `main`에 반영된 상태를 기준으로, **배포 전 → 배포 → 배포 후** 절차와 롤백·모니터링을 정리합니다.

> **이 문서의 위치**: Staging readiness 검증은 [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md), 실제 production 배포 절차는 이 문서. 이 문서 자체는 **원격(Vercel/Supabase) 변경을 수행하지 않습니다** — 담당자가 별도 승인 후 실행합니다.

### 확정 결정값 (v1)
1. **초기 seed에 reviewed 41문항 포함** — `seed.sql` + `seed_problems.sql` 적용을 권장 경로로 문서화. (위험: §8 정답 평문 노출)
2. **production email confirmation = ON** — SMTP 공급자 설정은 **배포 전 필수 gate**. SMTP 미준비 시 public production deploy 금지.
3. **hosting = Vercel(앱) + Supabase hosted(DB/Auth)**.
4. **report:metrics = 초기 일 1회 수동** — 자동화(Cron/Actions)는 후속 과제.

---

## 1. Preconditions

배포를 시작하기 전 아래가 모두 충족되어야 합니다.

- [ ] `main` = `origin/main`, working tree clean. `npm run test`/`lint`/`build` green.
- [ ] Staging readiness PASS: `RELEASE_CHECKLIST.md` §3(build/test/lint) + §4·§5·§7(DB/RLS/metrics, Docker 환경) 통과.
- [ ] **Supabase hosted 프로젝트 존재** — 없으면 먼저 생성하고 **리전·Postgres 버전**을 기록(마이그레이션은 ANSI SQL이라 PG 13+ 호환).
- [ ] **Vercel 프로젝트 존재** 및 저장소 연결.
- [ ] **SMTP 공급자 준비**(결정 2) — email confirmation ON 전제. 미준비 시 **public deploy 금지**.
- [ ] 배포 담당자가 hosted 프로젝트의 URL/anon/service_role 키에 접근 가능(키 값은 문서/로그에 남기지 않음).

> **HELD**: 브라우저 E2E는 로컬 Playwright MCP Bridge 미설치로 자동 미검증 상태. production smoke는 §5의 **수동 + 데이터 레벨**로 대체한다. 보안 핵심(제출 전 정답 미노출)은 DB 레벨(0006: `problems_public`에 answer 컬럼 부재 + base `problems` anon/authenticated SELECT 거부)로 이미 입증됨.

---

## 2. Env setup (Vercel)

앱/스크립트가 실제로 읽는 변수만 설정합니다.

| 변수 | 분류 | Vercel 설정 | 사용처 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client-exposed | NEXT_PUBLIC_ (All) | proxy.ts · lib/supabase/{client,server,admin}.ts |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client-exposed | NEXT_PUBLIC_ (All) | proxy.ts · client.ts · server.ts (RLS가 데이터 보호) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | **Sensitive / server env only** | admin.ts(window 가드) · report-metrics.mjs · dump-reviewed.mjs |

**🚫 `NEXT_PUBLIC_` 접두사 금지**: `SUPABASE_SERVICE_ROLE_KEY`(최우선), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

- 코드 전수 확인 결과 `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`는 어디에도 없음 — server-only 경계 유지.
- `proxy.ts`는 두 NEXT_PUBLIC_ 값에 non-null(`!`)을 사용하므로 **누락 시 런타임 크래시**. 배포 전 둘 다 설정 확인.
- `ADMIN_EMAIL`/`ADMIN_PASSWORD`는 앱 런타임이 아니라 **로컬/CI 콘텐츠 import 스크립트 전용** — Vercel 런타임 env에 넣지 않음.

---

## 3. Hosted Supabase migration / seed plan

### 3.1 마이그레이션 (순서 0001 → 0007, forward-only)
- 의존성: 0002(RLS)←0001, 0004(admin)←0002, 0006(정책 drop/revoke)←0004, 0007←0003(auth.uid). **순서 엄수**.
- 수단: `supabase link` 후 `supabase db push`(권장) 또는 Studio SQL editor 순차 실행. *(별도 승인 후 담당자 수행)*
- **데이터 파괴 마이그레이션 없음**: DROP TABLE/COLUMN/TRUNCATE 없음. 0006은 `problems_read_reviewed` 정책 DROP + anon SELECT REVOKE(권한 변경, 행 삭제 아님), 0005는 ADD COLUMN(nullable).

### 3.2 config.toml은 로컬 전용 — hosted에서 별도 확인
| local `config.toml` | hosted에서 할 일 |
|---|---|
| ports 54321/54322/54323/54324 | 무시(hosted는 고정 endpoint) |
| `[db] major_version=17` | hosted Postgres 버전 확인·기록 |
| `[db.seed] sql_paths` | hosted는 자동 seed 안 함 → **수동 적용**(3.3) |
| `[auth] site_url=http://127.0.0.1:3000` | **프로덕션 도메인으로 설정** |
| `[auth] additional_redirect_urls` | prod(+staging) 도메인 등록 |
| `[auth.email] enable_confirmations=false` | **`true`로 설정(결정 2)** — SMTP 필요 |

### 3.3 Seed (결정 1: 41문항 포함)
권장 적용 순서(마이그레이션 적용 후):
1. `seed.sql` — taxonomy(subject 1 · unit 1 · **concept 15** · 선수관계). **필수**. 멱등(`ON CONFLICT DO NOTHING`).
2. `seed_problems.sql` — **reviewed 41문항**(answer/solution/wrong_feedback 포함). 멱등(`ON CONFLICT (import_key) DO NOTHING`). 적용해도 0006 하드닝으로 학생/anon은 `problems_public`(answer 제외)만 읽음.

검증 SQL: `select count(*) from concepts;` → **15**, `select count(*) from problems where reviewed;` → **41**.

> ⚠ **위험(§8 재게재)**: `seed_problems.sql`에는 **정답/풀이 평문**이 포함됨. 저장소를 **private 유지**하거나, 공개가 필요하면 seed 커밋 대신 **import-only 전략**(seed에서 제외하고 `/admin/import` 또는 service-role import로만 투입)으로 재검토.

### 3.4 admin_users 부트스트랩 (seed 없음 — 의도)
1. 첫 사용자 가입(§5의 이메일 확인 포함) → `auth.users.id` 확인.
2. Studio/psql: `insert into public.admin_users (user_id) values ('<auth.users.id>') on conflict do nothing;`
3. 검증: `/admin` 접근 가능. **이 단계 누락 시 `/admin` 전부 403** → 콘텐츠 검수/투입 불가.

### 3.5 service-role 주의
- `report_metrics`(service_role 전용)·`dump-reviewed.mjs`(answer 읽기 위해 service_role 필요)는 **백엔드/로컬 전용**.
- hosted service-role 키는 **서버 env / CI secret로만**. 브라우저·클라이언트 노출 금지.

---

## 4. Vercel deployment plan

순서:
1. (precondition) Supabase hosted 프로젝트 + 키 확보, SMTP 설정 완료.
2. **DB 먼저**: §3 마이그레이션 → seed → admin 부트스트랩을 **앱 배포 전에** 완료(앱이 빈 DB를 가리키면 onboarding/dashboard 빈 상태).
3. Supabase Auth: `site_url`/redirect URLs를 배포 도메인으로, email confirmation ON.
4. Vercel env 3종 설정(§2, service-role은 sensitive·server-only).
5. Production deploy *(별도 승인)*. Build `next build`(standalone 기본), `proxy.ts` 동작 확인.
6. 배포 직후 §5 smoke → §6 metrics 베이스라인.

---

## 5. Production smoke (배포 직후)

라우트/액션 기준 해피패스. production은 email confirmation ON이라 **수동/데이터 레벨**로 수행:

- [ ] `/login` 회원가입 → **이메일 확인 링크 클릭** → `/dashboard`.
- [ ] 신규 유저 `/dashboard` no-data → onboarding 유도 확인.
- [ ] `/onboarding` 학년·목표 → "미니 진단 시작"(`startDiagnosticSession`) → `/learn`.
- [ ] `/learn` 제출(`submitAttempt`, `app/learn/actions.ts`): **제출 전 클라이언트에 answer/solution 없음**, 제출 후 solution/wrong_feedback 노출. 서버 채점.
- [ ] "결과 보기"(`endSession`) → 성장 페이오프(Before→After·헤드라인·다음 복습).
- [ ] `/dashboard` 데이터 렌더(오늘의 성장·스트릭·퀘스트·최근 변화·지식맵·추천).
- [ ] **추천 CTA**("이 개념 학습"/"복습 시작", `startConceptSession`) → `recommendation_clicked` 발행 → focus 세션.
- [ ] **퀘스트 CTA**("시작", `startQuestSession`) → `quest_started` 발행 → focus 세션.

**자동화 한계 대체**: (a) QA가 실제 메일로 수동 1회 완주, (b) staging/internal은 Studio에서 테스트 유저 직접 생성 후 로그인, (c) **데이터 레벨** — `profiles`/`learning_sessions`/`analytics_events` 적재를 `report:metrics`로 교차 확인.

---

## 6. Metrics / reporting (결정 4: 일 1회 수동)

```bash
SUPABASE_SERVICE_ROLE_KEY=<server-only> SUPABASE_URL=<hosted> \
  npm run report:metrics -- --from <ISO> [--to <ISO>]
```

- 키 없으면 `Missing env: SUPABASE_SERVICE_ROLE_KEY` + exit 1(누출 없음).
- **`--from`은 0007 배포 시각 이후로 명시 권장**(이전 source 세션 혼선 방지). 미지정 시 "첫 이벤트부터" 경고.
- 출력 4섹션: **Loop completion / CTA conversion / Funnel / Retention**.
- **D1/D7 해석 주의**: D1은 가입 +1 KST일, D7은 +7 KST일 경과 후에야 성숙. 미성숙 코호트는 `—`로 표시(0% 오해 방지). **D7 의미 있는 수치는 런칭 +8일 이후**. 런칭 직후 데이터 희소는 정상.
- cadence: **초기 일 1회 수동**. 자동화(GitHub Actions/Vercel Cron)는 후속 과제.
- `logEvent`는 best-effort(실패를 삼킴, `lib/analytics/log-event.ts`) → CTA가 로그엔 보이는데 이벤트 0이면 발행 실패 신호. Supabase 로그에서 `log_event` 4xx(42501/22023) 확인.

---

## 7. Rollback plan

- **앱(Vercel)**: stateless → 이전 deployment "Redeploy"로 즉시 롤백(~2–3분). 서버 상태 없음, env 자동 승계.
- **DB(Supabase)**: 마이그레이션 **forward-only(DOWN 없음)**. 운영 롤백은 `db reset`(전체 데이터 파괴) 불가 → **forward-fix 원칙**(0008 보정 마이그레이션 또는 앱 핫픽스).
  - 0001/0002 롤백 = 치명적(데이터/RLS 소실) → **운영 금지**.
  - 0006 롤백 = 데이터 손실 없으나 정답 재노출(보안 회귀) → 즉시 재적용. 가급적 forward-fix.
  - 0005/0007 = 비교적 안전하나 역시 forward-fix 선호.
- **데이터 파괴 마이그레이션 없음** → 앱 롤백만으로 대부분 대응, DB는 유지가 기본.

---

## 8. Open risks / held items

| 항목 | 영향 | 대응 |
|---|---|---|
| `seed_problems.sql` 정답 평문 (결정 1) | 저장소 노출 시 정답 유출 | **private repo 유지** 또는 공개 전 **import-only 전략** 재검토 |
| SMTP 미준비 (결정 2) | email confirmation ON 시 가입 불가 | 배포 전 SMTP gate, 미준비 시 public deploy 금지 |
| 브라우저 E2E HELD | UI 흐름 자동 미검증 | 수동 smoke 1회 + 데이터 레벨 검증 |
| admin 부트스트랩 누락 | `/admin` 403, 콘텐츠 투입 불가 | §3.4를 배포 runbook 필수 단계로 |
| `site_url`/redirect 미변경 | auth 리디렉트 깨짐 | §3.2 hosted 설정 확인 |
| service-role 오설정(NEXT_PUBLIC_화) | 키 유출 | Vercel UI에서 접두사 없는 server env 재확인 |
| forward-only 마이그레이션 | 빠른 DB 롤백 불가 | forward-fix 절차 사전 합의 |
| D1/D7 조기 판단 | 미성숙 코호트 오해 | 런칭 +8일 이후 해석, 미성숙은 `—` |

---

## 배포 전 manual action 목록 (담당자 수행)

이 문서/저장소 작업으로는 처리할 수 없고 **사람이 원격에서** 해야 하는 것들:

1. Supabase hosted 프로젝트 생성·리전·Postgres 버전 확인(없을 경우).
2. SMTP 공급자 설정 + Supabase Auth email confirmation ON.
3. Supabase Auth `site_url` / redirect URLs를 프로덕션 도메인으로 설정.
4. hosted DB에 마이그레이션 0001~0007 적용(`supabase db push` 등).
5. hosted DB에 `seed.sql` → `seed_problems.sql` 적용, count 검증(15 / 41).
6. admin_users 부트스트랩(첫 관리자 UUID insert).
7. Vercel env 3종 설정(service-role은 server-only, NEXT_PUBLIC_ 금지).
8. Production deploy 실행 + §5 수동 smoke + §6 baseline `report:metrics`.

---

_갱신 시: 마이그레이션·env·seed·결정값이 바뀌면 §2·§3·§6과 결정값 섹션을 함께 업데이트하세요._
