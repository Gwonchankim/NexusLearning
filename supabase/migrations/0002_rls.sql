-- 0002_rls.sql
-- Row Level Security policies (PLAN.md §7 "RLS 원칙").
-- Supabase grants table privileges to anon/authenticated by default; access is
-- gated here by RLS. The service_role bypasses RLS (admin/seed tooling).

-- ---------- Public-read content taxonomy ----------

alter table public.subjects enable row level security;
alter table public.units enable row level security;
alter table public.concepts enable row level security;
alter table public.concept_prerequisites enable row level security;

create policy "subjects_public_read" on public.subjects
  for select to anon, authenticated using (true);
create policy "units_public_read" on public.units
  for select to anon, authenticated using (true);
create policy "concepts_public_read" on public.concepts
  for select to anon, authenticated using (true);
create policy "concept_prerequisites_public_read" on public.concept_prerequisites
  for select to anon, authenticated using (true);

-- ---------- Problems: only reviewed=true is public ----------
-- No policy exposes unreviewed rows, so only service_role can read them.
-- An admin review UI with elevated access arrives in PR2.

alter table public.problems enable row level security;

create policy "problems_read_reviewed" on public.problems
  for select to anon, authenticated using (reviewed = true);

-- ---------- profiles: owner read/write ----------

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- learning_sessions: owner read/write ----------

alter table public.learning_sessions enable row level security;

create policy "learning_sessions_select_own" on public.learning_sessions
  for select to authenticated using (auth.uid() = user_id);
create policy "learning_sessions_insert_own" on public.learning_sessions
  for insert to authenticated with check (auth.uid() = user_id);
create policy "learning_sessions_update_own" on public.learning_sessions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- attempts: owner read/create ----------

alter table public.attempts enable row level security;

create policy "attempts_select_own" on public.attempts
  for select to authenticated using (auth.uid() = user_id);
create policy "attempts_insert_own" on public.attempts
  for insert to authenticated with check (auth.uid() = user_id);

-- ---------- concept_mastery: owner read/write ----------

alter table public.concept_mastery enable row level security;

create policy "concept_mastery_select_own" on public.concept_mastery
  for select to authenticated using (auth.uid() = user_id);
create policy "concept_mastery_insert_own" on public.concept_mastery
  for insert to authenticated with check (auth.uid() = user_id);
create policy "concept_mastery_update_own" on public.concept_mastery
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- growth_snapshots: owner read only (writes via service_role) ----------

alter table public.growth_snapshots enable row level security;

create policy "growth_snapshots_select_own" on public.growth_snapshots
  for select to authenticated using (auth.uid() = user_id);
