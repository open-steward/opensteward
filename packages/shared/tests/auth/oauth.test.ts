import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  generateState,
  storePendingState,
  consumePendingState,
  isTokenExpired,
} from '../../src/auth/oauth'

describe('OAuth state lifecycle', () => {
  it('generates a unique hex token', () => {
    const a = generateState()
    const b = generateState()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  it('stores and consumes state (accounting pattern)', () => {
    const token = generateState()
    storePendingState(token, 'xero', { label: 'Production' })
    const state = consumePendingState(token)
    expect(state).not.toBeNull()
    expect(state!.platform).toBe('xero')
    expect(state!.label).toBe('Production')
  })

  it('stores and consumes state with tenantId + redirectUri (logistics pattern)', () => {
    const token = generateState()
    storePendingState(token, 'ups', {
      tenantId: 'tenant-1',
      redirectUri: 'http://localhost/callback',
      label: 'Primary',
    })
    const state = consumePendingState(token)
    expect(state).not.toBeNull()
    expect(state!.tenantId).toBe('tenant-1')
    expect(state!.redirectUri).toBe('http://localhost/callback')
    expect(state!.label).toBe('Primary')
  })

  it('returns null for unknown token', () => {
    expect(consumePendingState('nonexistent')).toBeNull()
  })

  it('consumes a token only once', () => {
    const token = generateState()
    storePendingState(token, 'xero')
    expect(consumePendingState(token)).not.toBeNull()
    expect(consumePendingState(token)).toBeNull()
  })

  it('returns null for expired state', () => {
    const token = generateState()
    storePendingState(token, 'xero')

    // Fast-forward time past the 10-minute TTL
    vi.useFakeTimers()
    vi.advanceTimersByTime(11 * 60 * 1000)
    expect(consumePendingState(token)).toBeNull()
    vi.useRealTimers()
  })
})

describe('isTokenExpired', () => {
  afterEach(() => vi.useRealTimers())

  it('returns false when no expiresAt', () => {
    expect(isTokenExpired(undefined)).toBe(false)
  })

  it('returns false when token is far from expiry', () => {
    const future = new Date(Date.now() + 3600_000) // 1 hour
    expect(isTokenExpired(future)).toBe(false)
  })

  it('returns true when token expires within default buffer', () => {
    const soon = new Date(Date.now() + 30_000) // 30 seconds
    expect(isTokenExpired(soon)).toBe(true) // default buffer is 60s
  })

  it('respects custom buffer', () => {
    const soon = new Date(Date.now() + 30_000) // 30 seconds
    expect(isTokenExpired(soon, 10_000)).toBe(false) // 10s buffer → still valid
    expect(isTokenExpired(soon, 60_000)).toBe(true) // 60s buffer → expired
  })

  it('returns true when token is already expired', () => {
    const past = new Date(Date.now() - 1000)
    expect(isTokenExpired(past)).toBe(true)
  })
})
