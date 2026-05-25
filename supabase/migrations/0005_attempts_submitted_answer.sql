-- 0005_attempts_submitted_answer.sql
-- PR3: persist the learner's RAW submitted answer on each attempt.
-- Used for transparency / debugging / content-review feedback.
-- Nullable; the existing attempts RLS (attempts_insert_own / attempts_select_own
-- from 0002_rls.sql) already covers this new column — no policy change needed.

alter table public.attempts
  add column if not exists submitted_answer text;
