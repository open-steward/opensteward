import { describe, it, expect } from 'vitest'
import {
  isInvalidGrant,
  isInvalidClient,
  classifyRefreshError,
  refreshStatusForError,
} from '../../src/auth/refresh-error'

describe('isInvalidGrant', () => {
  it('matches Axios-style {response: {data: {error: invalid_grant}}}', () => {
    const err = { response: { data: { error: 'invalid_grant' }, status: 400 } }
    expect(isInvalidGrant(err)).toBe(true)
  })

  it('matches unauthorized_client', () => {
    const err = { response: { data: { error: 'unauthorized_client' } } }
    expect(isInvalidGrant(err)).toBe(true)
  })

  it('matches plain Error with code in message', () => {
    expect(isInvalidGrant(new Error('Token refresh failed: invalid_grant'))).toBe(true)
    expect(isInvalidGrant(new Error('upstream returned unauthorized_client'))).toBe(true)
  })

  it('matches direct body shape {error: invalid_grant}', () => {
    expect(isInvalidGrant({ error: 'invalid_grant' })).toBe(true)
  })

  it('matches nested error.code shape', () => {
    expect(isInvalidGrant({ error: { code: 'invalid_grant' } })).toBe(true)
  })

  it('walks .cause for wrapped errors', () => {
    const inner = { response: { data: { error: 'invalid_grant' } } }
    const wrapped = { message: 'wrapper', cause: inner }
    expect(isInvalidGrant(wrapped)).toBe(true)
  })

  it('returns false for transient/network errors', () => {
    expect(isInvalidGrant(new Error('ECONNRESET'))).toBe(false)
    expect(isInvalidGrant({ response: { status: 503 } })).toBe(false)
    expect(isInvalidGrant({ code: 'ETIMEDOUT' })).toBe(false)
  })

  it('returns false for null / undefined / unrelated shapes', () => {
    expect(isInvalidGrant(null)).toBe(false)
    expect(isInvalidGrant(undefined)).toBe(false)
    expect(isInvalidGrant('a string')).toBe(false)
    expect(isInvalidGrant({ ok: true })).toBe(false)
  })

  it('does NOT treat invalid_client as a grant failure (it is a platform problem)', () => {
    expect(isInvalidGrant({ response: { data: { error: 'invalid_client' } } })).toBe(false)
    expect(isInvalidGrant(new Error('token endpoint: invalid_client'))).toBe(false)
  })
})

describe('isInvalidClient', () => {
  it('matches invalid_client across shapes', () => {
    expect(isInvalidClient({ response: { data: { error: 'invalid_client' }, status: 401 } })).toBe(true)
    expect(isInvalidClient({ error: 'invalid_client' })).toBe(true)
    expect(isInvalidClient({ error: { code: 'invalid_client' } })).toBe(true)
    expect(isInvalidClient(new Error('refresh failed: invalid_client'))).toBe(true)
    expect(isInvalidClient({ message: 'w', cause: { error: 'invalid_client' } })).toBe(true)
  })

  it('matches the "client authentication failed" message hint', () => {
    expect(isInvalidClient(new Error('401 Unauthorized: client authentication failed'))).toBe(true)
  })

  it('is false for grant failures and transient errors', () => {
    expect(isInvalidClient({ error: 'invalid_grant' })).toBe(false)
    expect(isInvalidClient(new Error('ECONNRESET'))).toBe(false)
    expect(isInvalidClient(null)).toBe(false)
  })
})

describe('classifyRefreshError / refreshStatusForError', () => {
  it('classifies the three buckets', () => {
    expect(classifyRefreshError({ error: 'invalid_client' })).toBe('invalid_client')
    expect(classifyRefreshError({ error: 'invalid_grant' })).toBe('invalid_grant')
    expect(classifyRefreshError({ error: 'unauthorized_client' })).toBe('invalid_grant')
    expect(classifyRefreshError(new Error('503'))).toBe('transient')
  })

  it('maps to the persisted last_refresh_status', () => {
    expect(refreshStatusForError({ error: 'invalid_client' })).toBe('platform_error')
    expect(refreshStatusForError({ error: 'invalid_grant' })).toBe('expired')
    expect(refreshStatusForError(new Error('ETIMEDOUT'))).toBe('failed')
  })
})
