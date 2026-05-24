-- seed.sql
-- Seed content for the EduHelp_AI MVP: 공통수학1 > 다항식 (Polynomials).
-- Run automatically by `supabase start` / `supabase db reset`.
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING).
-- Note: PR1 seeds the taxonomy only. Reviewed problems arrive in PR2.

-- ---------- Subject ----------
insert into public.subjects (id, name, order_index) values
  ('common-math-1', '공통수학1', 1)
on conflict (id) do nothing;

-- ---------- Unit ----------
insert into public.units (id, subject_id, name, order_index) values
  ('polynomials', 'common-math-1', '다항식', 1)
on conflict (id) do nothing;

-- ---------- Concepts (15) ----------
insert into public.concepts (id, unit_id, name, description, difficulty_base, order_index) values
  ('poly-basics',                     'polynomials', '다항식의 정리',                 '항, 차수, 계수와 내림차순/오름차순 정리',        0.8, 1),
  ('poly-add-sub',                    'polynomials', '다항식의 덧셈과 뺄셈',          '동류항 정리를 통한 덧셈과 뺄셈',                0.9, 2),
  ('poly-mult',                       'polynomials', '다항식의 곱셈',                 '분배법칙을 이용한 전개',                       1.0, 3),
  ('mult-formulas',                   'polynomials', '곱셈 공식',                     '대표적인 곱셈 공식과 전개',                     1.0, 4),
  ('mult-formulas-advanced',          'polynomials', '곱셈 공식의 변형',              '곱셈 공식의 변형과 활용',                       1.2, 5),
  ('poly-division',                   'polynomials', '다항식의 나눗셈',               'A = BQ + R 형태의 다항식 나눗셈',               1.2, 6),
  ('synthetic-division',              'polynomials', '조립제법',                     '일차식으로 나눌 때의 조립제법',                 1.1, 7),
  ('identity',                        'polynomials', '항등식',                       '항등식의 뜻과 성질',                           1.0, 8),
  ('undetermined-coeff',              'polynomials', '미정계수법',                   '계수비교법과 수치대입법',                       1.3, 9),
  ('remainder-theorem',               'polynomials', '나머지정리',                   '나머지정리를 이용한 나머지 계산',               1.1, 10),
  ('factor-theorem',                  'polynomials', '인수정리',                     '인수정리를 이용한 인수 판정',                   1.2, 11),
  ('factorization-basic',             'polynomials', '인수분해 기본',                '공통인수와 기본 인수분해',                       1.0, 12),
  ('factorization-formula',           'polynomials', '곱셈 공식을 이용한 인수분해',    '곱셈 공식을 역으로 이용한 인수분해',             1.1, 13),
  ('factorization-advanced',          'polynomials', '복잡한 식의 인수분해',          '치환과 복이차식의 인수분해',                     1.4, 14),
  ('factorization-by-factor-theorem', 'polynomials', '인수정리를 이용한 인수분해',    '인수정리와 조립제법으로 삼차 이상 인수분해',      1.4, 15)
on conflict (id) do nothing;

-- ---------- Prerequisite DAG (concept depends on prereq_concept) ----------
insert into public.concept_prerequisites (concept_id, prereq_concept_id) values
  ('poly-add-sub',                    'poly-basics'),
  ('poly-mult',                       'poly-add-sub'),
  ('mult-formulas',                   'poly-mult'),
  ('mult-formulas-advanced',          'mult-formulas'),
  ('poly-division',                   'poly-mult'),
  ('synthetic-division',              'poly-division'),
  ('identity',                        'poly-mult'),
  ('undetermined-coeff',              'identity'),
  ('remainder-theorem',               'poly-division'),
  ('factor-theorem',                  'remainder-theorem'),
  ('factorization-basic',             'mult-formulas'),
  ('factorization-formula',           'factorization-basic'),
  ('factorization-formula',           'mult-formulas-advanced'),
  ('factorization-advanced',          'factorization-formula'),
  ('factorization-by-factor-theorem', 'factor-theorem'),
  ('factorization-by-factor-theorem', 'factorization-basic'),
  ('factorization-by-factor-theorem', 'synthetic-division')
on conflict (concept_id, prereq_concept_id) do nothing;
