-- 0001_init.sql
-- EduHelp_AI core schema (PLAN.md §7). Tables only; RLS in 0002, triggers in 0003.
-- gen_random_uuid() is available in Postgres 13+ and on Supabase by default.

-- ---------- Content taxonomy (slug PKs: human-readable & stable for seeds) ----------

create table if not exists public.subjects (
  id          text primary key,
  name        text not null,
  order_index integer not null default 0
);

create table if not exists public.units (
  id          text primary key,
  subject_id  text not null references public.subjects (id) on delete cascade,
  name        text not null,
  order_index integer not null default 0
);

create table if not exists public.concepts (
  id              text primary key,
  unit_id         text not null references public.units (id) on delete cascade,
  name            text not null,
  description     text,
  difficulty_base double precision not null default 1.0,
  order_index     integer not null default 0
);

create table if not exists public.concept_prerequisites (
  concept_id        text not null references public.concepts (id) on delete cascade,
  prereq_concept_id text not null references public.concepts (id) on delete cascade,
  primary key (concept_id, prereq_concept_id),
  constraint concept_prereq_not_self check (concept_id <> prereq_concept_id)
);

-- ---------- Problem bank ----------

create table if not exists public.problems (
  id             uuid primary key default gen_random_uuid(),
  concept_id     text not null references public.concepts (id) on delete cascade,
  stem           text not null,
  choices        jsonb,
  answer         text not null,
  solution       text,
  wrong_feedback text,
  difficulty     text not null default 'medium'
                   check (difficulty in ('easy', 'medium', 'hard')),
  answer_type    text not null default 'multiple_choice'
                   check (answer_type in ('multiple_choice', 'short_answer', 'expression')),
  source         text not null default 'seed'
                   check (source in ('ai', 'human', 'seed')),
  reviewed       boolean not null default false,
  reviewer_id    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists problems_concept_id_idx on public.problems (concept_id);
create index if not exists problems_reviewed_idx on public.problems (reviewed);

-- ---------- Per-user app profile (separate from auth.users) ----------

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  grade      text,
  goal       text,
  created_at timestamptz not null default now()
);

-- ---------- Learning activity ----------

create table if not exists public.learning_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  summary    jsonb
);

create index if not exists learning_sessions_user_id_idx on public.learning_sessions (user_id);

create table if not exists public.attempts (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid references public.learning_sessions (id) on delete set null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  problem_id uuid references public.problems (id) on delete set null,
  concept_id text references public.concepts (id) on delete set null,
  correct    boolean not null,
  time_ms    integer,
  mode       text not null default 'practice'
               check (mode in ('diagnostic', 'practice')),
  created_at timestamptz not null default now()
);

create index if not exists attempts_user_id_idx on public.attempts (user_id);
create index if not exists attempts_concept_id_idx on public.attempts (concept_id);

-- ---------- Mastery & spaced-repetition state ----------

create table if not exists public.concept_mastery (
  user_id          uuid not null references auth.users (id) on delete cascade,
  concept_id       text not null references public.concepts (id) on delete cascade,
  mastery          double precision not null default 0,
  attempts_count   integer not null default 0,
  last_reviewed_at timestamptz,
  next_review_at   timestamptz,
  interval_days    integer not null default 0,
  ease             double precision not null default 2.5,
  primary key (user_id, concept_id)
);

create index if not exists concept_mastery_next_review_idx
  on public.concept_mastery (user_id, next_review_at);

-- ---------- Daily growth snapshots ----------

create table if not exists public.growth_snapshots (
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,
  unit_id     text not null references public.units (id) on delete cascade,
  mastery_avg double precision not null,
  primary key (user_id, date, unit_id)
);
