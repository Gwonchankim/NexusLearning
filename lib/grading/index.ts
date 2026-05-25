// Pure answer-grading module (PR3). No Supabase/Next imports — unit tested.
//
// Scope (PR2_PLAN §정답 표기/채점 경계 → PR3): MINIMAL normalization only.
// - multiple_choice: whitespace-insensitive compare to canonical answer.
// - short_answer: trim/collapse whitespace; O/X tokens normalized internally.
// - expression: LIMITED reorder normalization — top-level sum terms and
//   top-level product factors may be reordered, and simple polynomials inside
//   parentheses are term-sorted. `^n` stays attached to its group.
//   NOT supported: expand<->factor equivalence ((x+3)(x+4) vs x^2+7x+12),
//   (x+3)^2 vs (x+3)(x+3), or any CAS-level algebraic equivalence.
//   On a parse failure it safely falls back to a whitespace-only comparison.
//   Full algebraic equivalence is an explicit follow-up PR task.

export type AnswerType = 'multiple_choice' | 'short_answer' | 'expression'

export interface GradeInput {
  answerType: AnswerType
  submitted: string
  answer: string
  choices?: string[] | null
}

export interface GradeResult {
  correct: boolean
  /** Normalized form of the submission (response/feedback only — never stored). */
  normalizedSubmitted: string
}

const ZERO_WIDTH = /[​‌‍﻿]/g

/** Remove ALL whitespace incl. full-width/NBSP (matched by \s in JS) + zero-width. */
export function stripSpace(s: string): string {
  return s.replace(/\s/g, '').replace(ZERO_WIDTH, '')
}

/** Trim and collapse internal whitespace runs to a single space. */
function collapseSpace(s: string): string {
  return s.replace(ZERO_WIDTH, '').trim().replace(/\s+/g, ' ')
}

const OX_TRUE = new Set(['o', 'ㅇ', '예', 'yes', 'true', '1', '참'])
const OX_FALSE = new Set(['x', '아니오', '아니요', 'no', 'false', '0', '거짓'])

/** Map an O/X-style token to 'O' | 'X', or null if it is not an O/X token. */
export function normalizeOX(s: string): 'O' | 'X' | null {
  const k = stripSpace(s).toLowerCase()
  if (OX_TRUE.has(k)) return 'O'
  if (OX_FALSE.has(k)) return 'X'
  return null
}

function gradeMultipleChoice(submitted: string, answer: string): GradeResult {
  const ns = stripSpace(submitted)
  return { correct: ns === stripSpace(answer), normalizedSubmitted: ns }
}

function gradeShortAnswer(submitted: string, answer: string): GradeResult {
  // O/X questions are modeled as short_answer with answer "O"/"X"
  // (e.g. factor-theorem-01/02). Use the O/X path when the canonical answer is O/X.
  if (normalizeOX(answer) !== null) {
    const so = normalizeOX(submitted)
    return {
      correct: so !== null && so === normalizeOX(answer),
      normalizedSubmitted: so ?? collapseSpace(submitted),
    }
  }
  const ns = collapseSpace(submitted)
  return { correct: ns === collapseSpace(answer), normalizedSubmitted: ns }
}

// ---------- expression: limited reorder normalization ----------

/** Split an expression into signed top-level sum terms (respecting paren depth). */
function splitSum(s: string): { sign: string; body: string }[] {
  const terms: { sign: string; body: string }[] = []
  let depth = 0
  let cur = ''
  let sign = '+'
  let started = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    if (depth < 0) throw new Error('unbalanced parens')
    if ((c === '+' || c === '-') && depth === 0) {
      if (!started) {
        sign = c
        started = true
        continue
      }
      terms.push({ sign, body: cur })
      sign = c
      cur = ''
      continue
    }
    cur += c
    started = true
  }
  if (cur !== '') terms.push({ sign, body: cur })
  if (depth !== 0) throw new Error('unbalanced parens')
  return terms
}

/** Split a product term into factors: paren groups (with optional ^n) or monomials. */
function splitFactors(body: string): string[] {
  const factors: string[] = []
  let i = 0
  while (i < body.length) {
    const c = body[i]
    if (c === '*' || c === '·') {
      i++
      continue
    }
    if (c === '(') {
      let depth = 0
      let j = i
      for (; j < body.length; j++) {
        if (body[j] === '(') depth++
        else if (body[j] === ')') {
          depth--
          if (depth === 0) break
        }
      }
      if (depth !== 0) throw new Error('unbalanced parens')
      let end = j + 1
      if (body[end] === '^') {
        end++
        while (end < body.length && /\d/.test(body[end])) end++
      }
      factors.push(body.slice(i, end))
      i = end
    } else {
      let j = i
      while (j < body.length && body[j] !== '(' && body[j] !== '*' && body[j] !== '·') j++
      factors.push(body.slice(i, j))
      i = j
    }
  }
  return factors
}

function normFactor(f: string): string {
  if (f.startsWith('(')) {
    let depth = 0
    let j = 0
    for (; j < f.length; j++) {
      if (f[j] === '(') depth++
      else if (f[j] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    const inner = f.slice(1, j)
    const suffix = f.slice(j + 1) // e.g. "^2" — kept attached, NOT expanded
    return '(' + normSum(inner) + ')' + suffix
  }
  return f
}

function normTerm(body: string): string {
  const factors = splitFactors(body).map(normFactor)
  factors.sort()
  return factors.join('*')
}

function normSum(s: string): string {
  const normed = splitSum(s).map((t) => t.sign + normTerm(t.body))
  normed.sort()
  return normed.join('')
}

function canonExpr(s: string): string {
  const base = stripSpace(s).replace(/·/g, '*')
  try {
    return normSum(base)
  } catch {
    return base // safe whitespace-only fallback
  }
}

function gradeExpression(submitted: string, answer: string): GradeResult {
  const ns = canonExpr(submitted)
  return { correct: ns === canonExpr(answer), normalizedSubmitted: ns }
}

export function gradeAnswer(input: GradeInput): GradeResult {
  switch (input.answerType) {
    case 'multiple_choice':
      return gradeMultipleChoice(input.submitted, input.answer)
    case 'short_answer':
      return gradeShortAnswer(input.submitted, input.answer)
    case 'expression':
      return gradeExpression(input.submitted, input.answer)
    default: {
      const ns = collapseSpace(input.submitted)
      return { correct: ns === collapseSpace(input.answer), normalizedSubmitted: ns }
    }
  }
}
