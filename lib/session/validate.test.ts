import { describe, it, expect } from 'vitest'
import { parseProblemIds, checkSubmission } from './validate'

describe('parseProblemIds', () => {
  it('returns string ids from a valid array', () => {
    expect(parseProblemIds(['a', 'b'])).toEqual(['a', 'b'])
  })
  it('filters out non-strings and handles non-arrays', () => {
    expect(parseProblemIds(['a', 1, null, 'b'])).toEqual(['a', 'b'])
    expect(parseProblemIds(undefined)).toEqual([])
    expect(parseProblemIds(null)).toEqual([])
    expect(parseProblemIds('a')).toEqual([])
    expect(parseProblemIds({ problemIds: ['a'] })).toEqual([])
  })
})

describe('checkSubmission', () => {
  const ids = ['p1', 'p2', 'p3']

  it('accepts a valid, first-time submission for an in-session problem', () => {
    expect(
      checkSubmission({ problemIds: ids, problemId: 'p2', sessionEnded: false, alreadyAttempted: false }),
    ).toEqual({ ok: true })
  })

  it('rejects when the session has ended', () => {
    expect(
      checkSubmission({ problemIds: ids, problemId: 'p2', sessionEnded: true, alreadyAttempted: false }),
    ).toEqual({ ok: false, reason: 'session_ended' })
  })

  it('rejects a problem not in the session', () => {
    expect(
      checkSubmission({ problemIds: ids, problemId: 'pX', sessionEnded: false, alreadyAttempted: false }),
    ).toEqual({ ok: false, reason: 'not_in_session' })
  })

  it('rejects a duplicate submission', () => {
    expect(
      checkSubmission({ problemIds: ids, problemId: 'p2', sessionEnded: false, alreadyAttempted: true }),
    ).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('prioritizes session_ended over not_in_session and duplicate', () => {
    expect(
      checkSubmission({ problemIds: ids, problemId: 'pX', sessionEnded: true, alreadyAttempted: true }),
    ).toEqual({ ok: false, reason: 'session_ended' })
  })
})
