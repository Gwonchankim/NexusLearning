import { describe, it, expect } from 'vitest'
import { gradeAnswer, normalizeOX, stripSpace } from './index'

describe('stripSpace / normalizeOX', () => {
  it('strips regular and full-width spaces', () => {
    expect(stripSpace('x ^ 2 + 1')).toBe('x^2+1')
    expect(stripSpace('x　+　1')).toBe('x+1') // full-width spaces
  })
  it('maps O/X synonyms', () => {
    expect(normalizeOX('O')).toBe('O')
    expect(normalizeOX('o')).toBe('O')
    expect(normalizeOX('예')).toBe('O')
    expect(normalizeOX('yes')).toBe('O')
    expect(normalizeOX('X')).toBe('X')
    expect(normalizeOX('아니오')).toBe('X')
    expect(normalizeOX('no')).toBe('X')
    expect(normalizeOX('maybe')).toBeNull()
  })
})

describe('multiple_choice', () => {
  const g = (submitted: string, answer: string) =>
    gradeAnswer({ answerType: 'multiple_choice', submitted, answer }).correct
  it('matches ignoring whitespace', () => {
    expect(g('x^2 - 9', 'x^2 - 9')).toBe(true)
    expect(g('x^2-9', 'x^2 - 9')).toBe(true)
  })
  it('rejects a different choice', () => {
    expect(g('x^2 + 9', 'x^2 - 9')).toBe(false)
  })
})

describe('short_answer (numeric)', () => {
  const g = (submitted: string, answer: string) =>
    gradeAnswer({ answerType: 'short_answer', submitted, answer }).correct
  it('accepts exact / trims surrounding whitespace', () => {
    expect(g('13', '13')).toBe(true)
    expect(g('  13 ', '13')).toBe(true)
  })
  it('rejects a different number', () => {
    expect(g('7', '13')).toBe(false)
    expect(g('13.0', '13')).toBe(false)
  })
})

describe('short_answer (O/X canonical)', () => {
  const g = (submitted: string, answer: string) =>
    gradeAnswer({ answerType: 'short_answer', submitted, answer }).correct
  it('normalizes O synonyms when answer is O', () => {
    expect(g('O', 'O')).toBe(true)
    expect(g('o', 'O')).toBe(true)
    expect(g('예', 'O')).toBe(true)
    expect(g('X', 'O')).toBe(false)
  })
  it('normalizes X synonyms when answer is X', () => {
    expect(g('아니오', 'X')).toBe(true)
    expect(g('x', 'X')).toBe(true)
    expect(g('O', 'X')).toBe(false)
  })
})

describe('expression — limited reorder (supported)', () => {
  const g = (submitted: string, answer: string) =>
    gradeAnswer({ answerType: 'expression', submitted, answer }).correct
  it('accepts reordered sum terms', () => {
    expect(g('-2x + 3 + 3x^2', '3x^2 - 2x + 3')).toBe(true)
    expect(g('x^2 + 8x + 15', 'x^2 + 8x + 15')).toBe(true)
  })
  it('accepts whitespace differences', () => {
    expect(g('x^2+8x+15', 'x^2 + 8x + 15')).toBe(true)
  })
  it('accepts reordered product factors', () => {
    expect(g('(x + 4)(x + 3)', '(x + 3)(x + 4)')).toBe(true)
    expect(g('(x - 1)(x - 3)(x - 2)', '(x - 1)(x - 2)(x - 3)')).toBe(true)
  })
  it('accepts reordered inner polynomial in a factor', () => {
    expect(g('(x + x^2 - 3)(1 + x^2 + x)', '(x^2 + x - 3)(x^2 + x + 1)')).toBe(true)
  })
  it('accepts coefficient*group regardless of order', () => {
    expect(g('2x(x + 2)', '2x(x + 2)')).toBe(true)
    expect(g('(x + 2)2x', '2x(x + 2)')).toBe(true)
  })
})

describe('expression — NOT supported (must stay wrong)', () => {
  const g = (submitted: string, answer: string) =>
    gradeAnswer({ answerType: 'expression', submitted, answer }).correct
  it('does NOT treat expanded == factored', () => {
    expect(g('x^2 + 7x + 12', '(x + 3)(x + 4)')).toBe(false)
  })
  it('does NOT treat (x+3)^2 == (x+3)(x+3)', () => {
    expect(g('(x + 3)(x + 3)', '(x + 3)^2')).toBe(false)
  })
  it('rejects a genuinely different expression', () => {
    expect(g('x^2 + 8x + 16', 'x^2 + 8x + 15')).toBe(false)
  })
})

describe('expression — fallback on unbalanced parens', () => {
  const g = (submitted: string, answer: string) =>
    gradeAnswer({ answerType: 'expression', submitted, answer }).correct
  it('still compares (whitespace-only) without throwing', () => {
    expect(g('(x + 3', '(x + 3')).toBe(true) // fallback equal
    expect(g('(x + 3', 'x + 3')).toBe(false)
  })
})
