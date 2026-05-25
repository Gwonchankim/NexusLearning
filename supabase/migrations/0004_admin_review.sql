-- 0004_admin_review.sql
-- PR2: admin review pipeline.
-- admin_users allowlist + is_admin() + problems admin RLS + idempotent import_key.

-- ---------- Admin allowlist (RLS-locked: no self-promotion) ----------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS enabled with NO policies → anon/authenticated cannot read or write it.
-- Admins are added manually via Studio/SQL (service_role / superuser bypasses RLS).
alter table public.admin_users enable row level security;

-- ---------- is_admin() helper ----------
-- SECURITY DEFINER so it can read admin_users regardless of the caller's RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

-- ---------- problems: admin policies (existing problems_read_reviewed stays) ----------
-- SELECT is OR-ed across permissive policies: students keep reviewed-only read,
-- admins additionally see unreviewed rows.
create policy "problems_admin_select" on public.problems
  for select to authenticated using (public.is_admin());
create policy "problems_admin_insert" on public.problems
  for insert to authenticated with check (public.is_admin());
create policy "problems_admin_update" on public.problems
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "problems_admin_delete" on public.problems
  for delete to authenticated using (public.is_admin());

-- ---------- Idempotent import key ----------
-- Plain UNIQUE constraint (Postgres allows multiple NULLs), so
-- `ON CONFLICT (import_key)` needs no predicate.
alter table public.problems add column if not exists import_key text;
alter table public.problems add constraint problems_import_key_key unique (import_key);

-- ---------- import_problems(payload jsonb) ----------
-- Single source of truth for idempotent draft import, used by both the admin UI
-- Server Action and scripts/import-problems.mjs (via RPC).
--   * admin-only (raises if caller is not in admin_users)
--   * import is ALWAYS reviewed=false / reviewer_id=null / reviewed_at=null
--     (these fields in the payload are ignored, never trusted)
--   * import_key is required and must be unique within the payload
--   * conflict on import_key: update only when existing row is reviewed=false;
--     reviewed=true rows are protected and counted as skipped
--   * returns {total, inserted, updated, skipped}
create or replace function public.import_problems(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  total int;
  ins   int := 0;
  upd   int := 0;
  missing int;
  dups  int;
begin
  if not public.is_admin() then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'payload must be a JSON array';
  end if;

  total := jsonb_array_length(payload);

  -- import_key required (non-empty)
  select count(*) into missing
  from jsonb_array_elements(payload) e
  where nullif(trim(coalesce(e ->> 'import_key', '')), '') is null;
  if missing > 0 then
    raise exception 'every item requires a non-empty import_key (% missing)', missing;
  end if;

  -- no duplicate import_key within the payload
  select count(*) into dups from (
    select e ->> 'import_key' as k
    from jsonb_array_elements(payload) e
    group by 1 having count(*) > 1
  ) d;
  if dups > 0 then
    raise exception 'duplicate import_key in payload (% duplicated key(s))', dups;
  end if;

  with input as (
    select * from jsonb_to_recordset(payload) as x(
      import_key     text,
      concept_id     text,
      stem           text,
      choices        jsonb,
      answer         text,
      solution       text,
      wrong_feedback text,
      difficulty     text,
      answer_type    text,
      source         text
    )
  ),
  up as (
    insert into public.problems (
      import_key, concept_id, stem, choices, answer, solution, wrong_feedback,
      difficulty, answer_type, source, reviewed, reviewer_id, reviewed_at
    )
    select
      import_key, concept_id, stem, choices, answer, solution, wrong_feedback,
      coalesce(difficulty, 'medium'),
      coalesce(answer_type, 'multiple_choice'),
      coalesce(source, 'ai'),
      false, null, null
    from input
    on conflict (import_key) do update set
      concept_id     = excluded.concept_id,
      stem           = excluded.stem,
      choices        = excluded.choices,
      answer         = excluded.answer,
      solution       = excluded.solution,
      wrong_feedback = excluded.wrong_feedback,
      difficulty     = excluded.difficulty,
      answer_type    = excluded.answer_type,
      source         = excluded.source
    where public.problems.reviewed = false
    returning (xmax = 0) as inserted
  )
  select
    count(*) filter (where inserted),
    count(*) filter (where not inserted)
  into ins, upd
  from up;

  return jsonb_build_object(
    'total', total,
    'inserted', ins,
    'updated', upd,
    'skipped', total - ins - upd
  );
end;
$$;

-- anon must NOT be able to import; authenticated only (admin enforced inside).
-- Supabase's default privileges grant EXECUTE to anon directly, so revoking from
-- PUBLIC is not enough — revoke from anon explicitly.
revoke execute on function public.import_problems(jsonb) from public;
revoke execute on function public.import_problems(jsonb) from anon;
grant execute on function public.import_problems(jsonb) to authenticated;
