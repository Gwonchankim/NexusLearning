-- 0007_analytics_events.sql
-- PR6 instrumentation: measure loop completion + D1/D7 retention + CTA conversion.
--
-- Design (trimmed): the only DB-derivation-impossible signal is CTA *click intent*
-- (a click that never produced a session leaves no trace). So this table stores ONLY
-- two events — recommendation_clicked, quest_started. Everything else (signup cohort,
-- session start/completion, onboarding, CTA-result sessions) is DERIVED at report time
-- from profiles / learning_sessions.
--
-- PRIVACY — props MUST contain only IDs / enums / booleans / counts.
-- NEVER store: raw submitted_answer, free-text goal/grade, email, names,
-- problem stem/solution/answer, IP / User-Agent. The log_event() RPC enforces a
-- strict per-event key+value whitelist so forbidden keys/values are rejected.

-- ---------- table ----------
create table public.analytics_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete set null,
  name       text not null check (name in ('recommendation_clicked', 'quest_started')),
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.analytics_events is
  'PR6 funnel events (recommendation_clicked, quest_started). props = IDs/enums only; never PII (see 0007 header).';

create index analytics_events_name_created_idx on public.analytics_events (name, created_at);
create index analytics_events_user_created_idx on public.analytics_events (user_id, created_at);

-- RLS enabled with NO policies: anon/authenticated cannot read or directly write.
-- Writes go through log_event() (SECURITY DEFINER); reads via service_role (bypasses RLS).
-- Same lock pattern as admin_users (0004).
alter table public.analytics_events enable row level security;

-- ---------- log_event(): write RPC (SECURITY DEFINER is justified) ----------
-- Callers are `authenticated` but analytics_events has no INSERT policy, so an
-- invoker-rights insert is blocked by RLS — the function must run as owner (postgres,
-- bypasses RLS) to insert. Same rationale as import_problems (0004).
-- user_id is forced to auth.uid() (the CALLER's JWT claim, not the definer's) so a
-- client can never spoof another user or set an arbitrary user_id.
create or replace function public.log_event(p_name text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := coalesce(p_props, '{}'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'log_event requires an authenticated user' using errcode = '42501';
  end if;

  -- name whitelist (table CHECK enforces this too — defense in depth)
  if p_name not in ('recommendation_clicked', 'quest_started') then
    raise exception 'unknown event name: %', p_name using errcode = '22023';
  end if;

  -- general props guard: a small JSON object only
  if jsonb_typeof(v) <> 'object' then
    raise exception 'props must be a json object' using errcode = '22023';
  end if;
  if pg_column_size(v) > 4096 then
    raise exception 'props too large' using errcode = '22023';
  end if;

  -- per-event key+value whitelist: rejects forbidden keys (email/answer/...),
  -- enum violations (source/kind), and non-slug / over-length conceptId.
  if p_name = 'recommendation_clicked' then
    if exists (select 1 from jsonb_object_keys(v) k where k not in ('conceptId', 'source')) then
      raise exception 'recommendation_clicked: unexpected prop key' using errcode = '22023';
    end if;
    if jsonb_typeof(v -> 'conceptId') is distinct from 'string'
       or coalesce(v ->> 'conceptId', '') !~ '^[a-z0-9][a-z0-9-]{0,63}$' then
      raise exception 'recommendation_clicked: invalid conceptId' using errcode = '22023';
    end if;
    if coalesce(v ->> 'source', '') not in ('frontier', 'fallback') then
      raise exception 'recommendation_clicked: invalid source' using errcode = '22023';
    end if;
  elsif p_name = 'quest_started' then
    if exists (select 1 from jsonb_object_keys(v) k where k not in ('conceptId', 'kind')) then
      raise exception 'quest_started: unexpected prop key' using errcode = '22023';
    end if;
    if jsonb_typeof(v -> 'conceptId') is distinct from 'string'
       or coalesce(v ->> 'conceptId', '') !~ '^[a-z0-9][a-z0-9-]{0,63}$' then
      raise exception 'quest_started: invalid conceptId' using errcode = '22023';
    end if;
    if coalesce(v ->> 'kind', '') not in ('new', 'review') then
      raise exception 'quest_started: invalid kind' using errcode = '22023';
    end if;
  end if;

  insert into public.analytics_events (user_id, name, props)
  values (auth.uid(), p_name, v);
end;
$$;

-- Supabase grants EXECUTE to anon/authenticated by default; lock to authenticated only.
revoke execute on function public.log_event(text, jsonb) from public, anon;
grant execute on function public.log_event(text, jsonb) to authenticated;

-- ---------- report_metrics(): read RPC (SECURITY INVOKER is sufficient) ----------
-- Only caller is service_role (REST service-role key), which bypasses RLS — so INVOKER
-- reads every row. DEFINER is unnecessary and INVOKER is safer (a leaked EXECUTE grant
-- still can't bypass RLS). No dynamic SQL.
--
-- Window/KST convention: p_from/p_to are absolute instants forming the half-open range
-- [p_from, p_to); null => unbounded lower / now() upper. Day bucketing (cohort/activity/
-- retention) uses 'Asia/Seoul' (KST, no DST). For "KST day D" pass 'D 00:00:00+09'.
create or replace function public.report_metrics(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  hi         timestamptz := coalesce(p_to, now());
  cta_lo     timestamptz := coalesce(p_from, (select min(created_at) from public.analytics_events));
  completion jsonb;
  cta        jsonb;
  funnel     jsonb;
  retention  jsonb;
begin
  -- completion: over sessions STARTED in [p_from, hi)
  with s as (
    select
      (ended_at is not null and coalesce((summary ->> 'problemCount')::int, 0) > 0) as completed,
      coalesce(summary ->> 'mode', 'practice') as mode
    from public.learning_sessions
    where started_at >= coalesce(p_from, '-infinity'::timestamptz) and started_at < hi
  )
  select jsonb_build_object(
    'started', count(*),
    'completed', count(*) filter (where completed),
    'rate', round(100.0 * count(*) filter (where completed) / nullif(count(*), 0), 1),
    'by_mode', jsonb_build_object(
      'diagnostic', jsonb_build_object(
        'started', count(*) filter (where mode = 'diagnostic'),
        'completed', count(*) filter (where mode = 'diagnostic' and completed),
        'rate', round(100.0 * count(*) filter (where mode = 'diagnostic' and completed)
                      / nullif(count(*) filter (where mode = 'diagnostic'), 0), 1)),
      'practice', jsonb_build_object(
        'started', count(*) filter (where mode = 'practice'),
        'completed', count(*) filter (where mode = 'practice' and completed),
        'rate', round(100.0 * count(*) filter (where mode = 'practice' and completed)
                      / nullif(count(*) filter (where mode = 'practice'), 0), 1))
    )
  ) into completion from s;

  -- cta: clicks and converted over the SAME window [cta_lo, hi) so PR6-prior `source`
  -- sessions never inflate the numerator.
  with clk as (
    select name from public.analytics_events
    where name in ('recommendation_clicked', 'quest_started')
      and created_at >= coalesce(cta_lo, hi) and created_at < hi
  ),
  conv as (
    select summary ->> 'source' as source from public.learning_sessions
    where summary ->> 'source' in ('frontier', 'fallback')
      and started_at >= coalesce(cta_lo, hi) and started_at < hi
  )
  select jsonb_build_object(
    'window_from', cta_lo,
    'clicks', (select count(*) from clk),
    'clicks_by_name', jsonb_build_object(
      'recommendation_clicked', (select count(*) from clk where name = 'recommendation_clicked'),
      'quest_started', (select count(*) from clk where name = 'quest_started')),
    'converted', (select count(*) from conv),
    'converted_by_source', jsonb_build_object(
      'frontier', (select count(*) from conv where source = 'frontier'),
      'fallback', (select count(*) from conv where source = 'fallback')),
    'conversion_pct', round(100.0 * (select count(*) from conv) / nullif((select count(*) from clk), 0), 1)
  ) into cta;

  -- funnel: signup cohort = profiles.created_at in [p_from, hi); activity limited to < hi
  -- (so a fixed p_to gives stable historical numbers).
  with cohort as (
    select id as user_id from public.profiles
    where created_at >= coalesce(p_from, '-infinity'::timestamptz) and created_at < hi
  )
  select jsonb_build_object(
    'signups', (select count(*) from cohort),
    'onboarded', (select count(distinct c.user_id) from cohort c
      join public.learning_sessions s on s.user_id = c.user_id
      where s.summary ->> 'mode' = 'diagnostic' and s.started_at < hi),
    'completed_at_least_one', (select count(distinct c.user_id) from cohort c
      join public.learning_sessions s on s.user_id = c.user_id
      where s.ended_at is not null and coalesce((s.summary ->> 'problemCount')::int, 0) > 0
        and s.ended_at < hi)
  ) into funnel;

  -- retention: D1/D7 = active EXACTLY on the Nth KST day after signup. Denominator =
  -- signup cohort. Immature cohorts (today < cohort_day + N) report null for that DN.
  with cohort as (
    select p.id as user_id, (p.created_at at time zone 'Asia/Seoul')::date as cohort_day
    from public.profiles p
    where p.created_at >= coalesce(p_from, '-infinity'::timestamptz) and p.created_at < hi
  ),
  activity as (  -- a user is "active" on a KST day iff they completed a loop that day
    select distinct s.user_id, (s.ended_at at time zone 'Asia/Seoul')::date as active_day
    from public.learning_sessions s
    where s.ended_at is not null and coalesce((s.summary ->> 'problemCount')::int, 0) > 0
  ),
  today as (select (now() at time zone 'Asia/Seoul')::date as d),
  r as (
    select
      c.cohort_day,
      count(*) as cohort_size,
      ((select d from today) >= c.cohort_day + 1) as d1_mature,
      count(*) filter (where exists (
        select 1 from activity a where a.user_id = c.user_id and a.active_day = c.cohort_day + 1)) as d1,
      ((select d from today) >= c.cohort_day + 7) as d7_mature,
      count(*) filter (where exists (
        select 1 from activity a where a.user_id = c.user_id and a.active_day = c.cohort_day + 7)) as d7
    from cohort c
    group by c.cohort_day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cohort_day', cohort_day,
    'cohort_size', cohort_size,
    'd1_mature', d1_mature,
    'd1', case when d1_mature then d1 end,
    'd1_pct', case when d1_mature then round(100.0 * d1 / nullif(cohort_size, 0), 1) end,
    'd7_mature', d7_mature,
    'd7', case when d7_mature then d7 end,
    'd7_pct', case when d7_mature then round(100.0 * d7 / nullif(cohort_size, 0), 1) end
  ) order by cohort_day), '[]'::jsonb) into retention from r;

  return jsonb_build_object(
    'completion', completion,
    'cta', cta,
    'funnel', funnel,
    'retention', retention
  );
end;
$$;

-- Report is service-role only (server-side script). Lock out everyone else.
revoke execute on function public.report_metrics(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.report_metrics(timestamptz, timestamptz) to service_role;
