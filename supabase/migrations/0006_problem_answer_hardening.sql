-- 0006_problem_answer_hardening.sql
-- Security hardening: stop anon/students from reading answer/solution/wrong_feedback.
--
-- Before: `problems_read_reviewed` (0002) let anon+authenticated SELECT every column
-- of reviewed rows, so the canonical answer/solution/wrong_feedback were exposed at
-- the DB/REST layer (e.g. `problems?select=answer&reviewed=eq.true`).
--
-- After:
--   * students/anon read ONLY a safe-column view (`problems_public`) — no answer/
--     solution/wrong_feedback.
--   * base `problems` is no longer student-readable (admin RLS from 0004 stays;
--     the app reads answers server-side via the service_role, never the client).

-- ---------- Safe public projection (reviewed rows, non-sensitive columns) ----------
-- Deliberately omits answer, solution, wrong_feedback.
-- Owner-privilege view (default security_invoker = off): it runs as its owner and
-- returns its WHERE rows regardless of the caller's RLS, so anon/authenticated need
-- only SELECT on the view (granted below), not on base `problems`.
create view public.problems_public as
  select id, concept_id, stem, choices, difficulty, answer_type, reviewed, created_at
  from public.problems
  where reviewed;

-- Supabase auto-grants ALL on new public views to anon/authenticated. Because this
-- is a simple (auto-updatable) view owned by postgres, those write grants would let
-- anon/authenticated UPDATE/DELETE base `problems` THROUGH the view — owner-privilege
-- writes (security_invoker = off) bypass RLS. Strip everything, then grant SELECT only.
revoke all on public.problems_public from anon, authenticated;
grant select on public.problems_public to anon, authenticated;

-- ---------- Remove student/anon base-table read ----------
-- Drops the all-columns reviewed read. The admin policies from 0004
-- (problems_admin_select/insert/update/delete via is_admin()) remain, so admins
-- still read base `problems` (incl. answer); non-admins now get 0 rows from base.
drop policy "problems_read_reviewed" on public.problems;

-- Defense-in-depth: remove anon's table-level SELECT privilege entirely
-- (authenticated keeps the grant so the admin RLS policies can apply).
revoke select on public.problems from anon;
