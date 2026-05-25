# PR5 — 성장 페이오프 & 오늘 할 일 (퀘스트·스트릭)

## Context
PR3(숙련도/스케줄러)·PR4(지식맵/frontier 추천)까지로 "다음에 뭘 학습할지"는 보이지만, **학습 직후의 성장 체감**과 **매일 돌아올 이유**가 없다. PR5는 두 축만 추가한다.
1. **세션 종료 페이오프**(완료 화면): 개념별 Before→After 게이지 + 성장 헤드라인 + 다음 복습 예고.
2. **대시보드 "오늘 할 일"**: 오늘의 성장(%p)·스트릭·오늘의 퀘스트(신규/복습)·최근 7세션 스파크라인.

모든 성장 수치는 **서버 계산**, 날짜는 **KST 고정 offset(+9h)**. **DB 마이그레이션 0, 신규 npm 의존성 0**, 시각화는 PR4와 동일한 경량 SVG/CSS.

> 코드 대조 확정: `learning_sessions.summary`는 jsonb라 컬럼 추가 불필요. `growth_snapshots`는 0001에 존재하나 RLS가 select-only(writes via service_role)라 **미사용(후속)**. `effectiveMastery`는 `lib/adaptive`. 임계값 0.7 = `GRAPH_DEFAULTS.masteryThreshold`. vitest `include: lib/**/*.test.ts`.

## 확정 결정 + 보정
- migration 0 · deps 0 · KST · `sessionMasteryDelta`=시도 distinct concept delta의 signed 평균 · `todayDelta`=오늘(KST) 완료세션 delta 합 · sparkline=최근 7 완료세션.
- **보정1**: `startMastery`는 세션 실제 distinct conceptId 기준. focus/general 모두 problemIds 존재 시에만 세션 생성(PR4 focus 0가드 유지 + 일반 세션도 빈 problemIds throw).
- **보정2**: `todayDelta` 합산 시 `sessionMasteryDelta===null||missing → 0`. "오늘 완료세션 없음"과 "완료세션 있으나 delta 없음"은 동일 중립 문구. 음수는 숫자 강조 없이 "복습으로 기반을 다졌어요".
- **버그 회피**: 복습/약점 퀘스트 item은 `startConceptSession`의 `isStartable`(frontier 전용)에 거부됨 → 전용 `startQuestSession`(loadGrowth로 quest 멤버십 재검증) 추가.

## OUT (이번 범위 밖)
`growth_snapshots` 영속화·장기 성장곡선 · PR6 계측(완주/D1/D7) · DB-level answer/solution hardening(후속 보안 PR) · 큰 애니메이션·캐릭터·보상·스트릭 프리즈 · Recharts 등 신규 의존성 · 7세션 초과/빈날 곡선.

## Data contract
**`learning_sessions.summary` (jsonb 확장, migration 없음)**: 기존 `{mode,problemIds,focusConceptId?,source?,problemCount?,correctCount?,durationMs?}` + `startMastery?:Record<id,eff(0..1)>`(createSession) + `conceptDeltas?:[{conceptId,before,after,delta}]`(slug, endSession) + `sessionMasteryDelta?:number|null` + `nextReviewAt?:string|null`.
**`SessionSummary`(endSession 반환, 확장)**: 기존 + `conceptDeltas:[{conceptId,name,before,after,delta}]`(name=concepts join) + `sessionMasteryDelta:number|null` + `nextReviewAt:string|null`.
**`lib/growth` 타입**: `QuestItem{conceptId,kind:'new'|'review',done}` · `TodayQuest{items,newDone,newTotal,reviewDone,reviewTotal}` · `StreakInfo{current,todayDone}` · `ConceptDelta{conceptId,before,after,delta}` · `DashboardGrowth{todayDelta,streak,quest,recent:[{date,delta}],nameById}`.

## Algorithms (lib/growth, 순수)
- `KST_OFFSET_MS=9*3.6e6`; `kstDate(d)=ISO(d+offset)[:10]`; `todayKst`; `prevDate(ymd)`; `startOfTodayUtc(today)`; `pp(x)=round(x*100)`.
- `summarizeSessionDeltas({conceptIds,startMastery,afterMastery})`: 빈 conceptIds 또는 startMastery 없으면 `{[],null}`; else c별 before=startMastery[c]??0, after=afterMastery[c]??0, delta=after-before(signed); sessionMasteryDelta=mean(delta).
- `buildTodayQuest({frontier,due,weakAsc,locked,todayConceptIds,targets={new:2,review:3}})`: locked 제거; new=frontier[:2]; review=(due∖new)+부족분 weakAsc, [:3]; dedupe; done=todayConceptIds 포함; totals=실제 수(패딩 X).
- `computeStreak(dates,today)`: todayDone=has(today); cursor=today||(has(yesterday)?yesterday:null); null→0; cursor부터 prevDate 연속 count.

## Server wiring
- `create-session.ts`: 세션 distinct concept(focus→[focusId], general→problemIds의 concept)별 effectiveMastery를 `summary.startMastery`에 저장 + **빈 problemIds throw**(보정1).
- `actions.ts endSession`: attempts select에 concept_id 추가→A(distinct); concept_mastery `.in(A)`로 after(effectiveMastery) + nextReviewAt(최소); concepts name join; summarizeSessionDeltas로 conceptDeltas/sessionMasteryDelta; summary 병합·SessionSummary 확장 반환.
- `recommend.ts loadRecommendation`: 반환에 `dueConceptIds` 추가.
- `app/dashboard/growth.ts loadGrowth()`(server-only): loadRecommendation 재사용 + 완료세션(스트릭/recent/todayDelta, null→0) + 오늘 attempts(todayConceptIds, gte startOfTodayUtc) + weakAsc/locked 파생 + buildTodayQuest → DashboardGrowth.
- `actions.ts startQuestSession(conceptId)`: loadGrowth 재계산→quest.items 멤버십 검증(없으면 throw)→createSession focus→redirect.

## UI
- **LearnSession 완료**: 헤드라인(null→생략 / >0 "+{pp}%p 올랐어요" / =0 "기반을 유지했어요" / <0 "복습으로 기반을 다졌어요" 음수 미표시) + conceptDeltas Before→After 게이지 + 다음 복습({M/D}). 풀이중 피드백 유지.
- **dashboard**: GrowthCards(오늘의 성장 헤드라인[보정2]·스트릭 배지·오늘의 퀘스트 item+진행+미완 CTA=startQuestSession; 빈 퀘스트는 추천 카드로 유도) + RecentSparkline(최근 7세션, <2 생략). 기존 평균/복습/추천/맵/리스트 유지.

## Tasks (구현 순서)
1. lib/growth/index.ts (KST·streak·quest·delta·pp·타입) · 2. lib/growth/growth.test.ts · 3. create-session startMastery+빈가드 · 4. endSession 델타 · 5. loadRecommendation dueConceptIds · 6. app/dashboard/growth.ts loadGrowth · 7. startQuestSession · 8. LearnSession 완료 UI · 9. dashboard GrowthCards/RecentSparkline 연결 · 10. README · 11. 검증.

## Verification
- Vitest `lib/growth` 전수(streak/quest/delta/KST 경계) + 기존 회귀. lint/build.
- DB/psql: createSession→summary.startMastery; endSession→conceptDeltas/sessionMasteryDelta(정·오답 signed)/nextReviewAt; psql로 오늘(KST) ended_at/attempts 주입→dashboard 데이터레벨(스트릭/퀘스트/오늘성장/sparkline).
- 브라우저 수동(가능 범위; MCP 미설치→데이터레벨 병행): 완료화면 4케이스, 복습 퀘스트 startQuestSession 경로.

## Risks / Deferred
노이즈(세션 signed 평균·음수 미강조·null graceful) · KST 고정 offset(서울 정확) · 과거 startMastery 부재→null 생략 · Deferred: growth_snapshots 영속화·PR6 계측·보안 하드닝 PR·애니메이션.
