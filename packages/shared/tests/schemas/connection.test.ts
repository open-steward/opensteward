import { describe, it, expect } from 'vitest'
import { computeStatus } from '../../src/schemas/connection'

describe('computeStatus', () => {
  it('returns valid when expiresAt is null/undefined and no refresh signal', () => {
    expect(computeStatus(null)).toBe('valid')
    expect(computeStatus(undefined)).toBe('valid')
    expect(computeStatus({ expiresAt: null })).toBe('valid')
  })

  it('returns expired when expiresAt is in the past', () => {
    const past = Date.now() - 60_000
    expect(computeStatus(past)).toBe('expired')
    expect(computeStatus({ expiresAt: past })).toBe('expired')
  })

  it('returns expiring_soon within 5 minutes', () => {
    const soon = Date.now() + 60_000
    expect(computeStatus(soon)).toBe('expiring_soon')
    expect(computeStatus({ expiresAt: soon })).toBe('expiring_soon')
  })

  it('returns valid for future expiresAt beyond the threshold', () => {
    const future = Date.now() + 60 * 60 * 1000
    expect(computeStatus(future)).toBe('valid')
  })

  it('lastRefreshStatus=expired wins over a future access-token expiry', () => {
    const future = Date.now() + 60 * 60 * 1000
    expect(
      computeStatus({ expiresAt: future, lastRefreshStatus: 'expired' }),
    ).toBe('expired')
  })

  it('lastRefreshStatus=ok and =failed do not override access-token state', () => {
    const future = Date.now() + 60 * 60 * 1000
    expect(computeStatus({ expiresAt: future, lastRefreshStatus: 'ok' })).toBe('valid')
    expect(computeStatus({ expiresAt: future, lastRefreshStatus: 'failed' })).toBe('valid')
  })

  it('lastRefreshStatus=platform_error wins over a future access-token expiry', () => {
    const future = Date.now() + 60 * 60 * 1000
    expect(
      computeStatus({ expiresAt: future, lastRefreshStatus: 'platform_error' }),
    ).toBe('platform_error')
    // and over a missing expiry too
    expect(computeStatus({ expiresAt: null, lastRefreshStatus: 'platform_error' })).toBe('platform_error')
  })
})

/**
 * `expired` means "the customer must re-authorise", not "this connection is
 * idle right now".
 *
 * Access tokens are short — Fortnox's live one hour — and are renewed
 * automatically, so a connection between uses routinely has a lapsed access
 * token and a perfectly good grant behind it. Reporting that as `expired`,
 * the same word used when the refresh grant itself is dead, would leave an
 * operator unable to tell an idle connection from one needing customer
 * action.
 *
 * Renewability is inferred from evidence already persisted: a connection that
 * has refreshed successfully at least once demonstrably holds a working
 * refresh token. Anything weaker keeps the conservative reading — a
 * connection that has never refreshed, or whose last attempt failed, is not
 * assumed to be fine.
 */
describe('computeStatus — an idle connection is not a broken one', () => {
  const HOUR = 60 * 60 * 1000

  it('reports a lapsed token as valid when the grant has proven it refreshes', () => {
    expect(
      computeStatus({ expiresAt: Date.now() - 2 * HOUR, lastRefreshStatus: 'ok' }),
    ).toBe('valid')
  })

  it('still reports a dead grant as expired', () => {
    expect(
      computeStatus({ expiresAt: Date.now() - 2 * HOUR, lastRefreshStatus: 'expired' }),
    ).toBe('expired')
  })

  it('still reports rejected platform credentials', () => {
    expect(
      computeStatus({ expiresAt: Date.now() - 2 * HOUR, lastRefreshStatus: 'platform_error' }),
    ).toBe('platform_error')
  })

  it('does not vouch for a connection that has never refreshed', () => {
    // No evidence a refresh token exists — an api-key-style connection whose
    // access token lapsed looks exactly like this, and it does need attention.
    expect(computeStatus({ expiresAt: Date.now() - 2 * HOUR, lastRefreshStatus: null })).toBe(
      'expired',
    )
  })

  it('does not vouch for one whose last refresh failed', () => {
    // Transient failures that keep recurring are a real outage; calling that
    // healthy because a refresh token exists would hide it.
    expect(
      computeStatus({ expiresAt: Date.now() - 2 * HOUR, lastRefreshStatus: 'failed' }),
    ).toBe('expired')
  })

  it('leaves a live token alone', () => {
    expect(computeStatus({ expiresAt: Date.now() + HOUR, lastRefreshStatus: 'ok' })).toBe('valid')
  })

  it('keeps the expiring_soon warning for a token about to lapse', () => {
    expect(
      computeStatus({ expiresAt: Date.now() + 60_000, lastRefreshStatus: 'ok' }),
    ).toBe('expiring_soon')
  })

  it('stays conservative for callers that pass only a timestamp', () => {
    // The number form carries no refresh evidence, so it cannot claim a lapsed
    // token is fine.
    expect(computeStatus(Date.now() - HOUR)).toBe('expired')
  })
})
