import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { generatePkcePair, storePendingState, consumePendingState, generateState } from '../../src/auth/oauth'

/**
 * Connecting ShipBob landed the customer on
 * `auth.shipbob.com/home/error?errorId=…` — an IdentityServer error page that
 * names no cause.
 *
 * ShipBob documents `code_challenge` and `code_challenge_method=S256` as
 * REQUIRED on the authorize request. The adapter sent neither, so the request
 * was refused before any consent screen. There is no `error=invalid_request`
 * to read anywhere, because the flow never reaches a callback — from our side
 * it is indistinguishable from a bad client_id or an unregistered
 * redirect_uri.
 *
 * PKCE existed in this repo only for admin SSO login. No adapter OAuth flow
 * had it.
 */

describe('the PKCE pair', () => {
  it('produces a verifier inside RFC 7636’s 43–128 character range', () => {
    const { verifier } = generatePkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
  })

  it('uses base64url, not base64', () => {
    // `+`, `/` and `=` are outside the unreserved set RFC 7636 allows, and
    // would be re-encoded or mangled in a query string — the challenge would
    // then not match the verifier and the exchange would fail with a valid
    // code, which is a miserable thing to debug.
    for (let i = 0; i < 50; i++) {
      const { verifier, challenge } = generatePkcePair()
      expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/)
      expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/)
    }
  })

  it('derives the challenge as base64url(SHA256(verifier))', () => {
    // The whole point of S256. A `plain` challenge (challenge === verifier)
    // would still be accepted by some providers while giving up the
    // protection entirely.
    const { verifier, challenge } = generatePkcePair()
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
    expect(challenge).not.toBe(verifier)
  })

  it('is different every call', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generatePkcePair().verifier))
    expect(seen.size).toBe(100)
  })
})

describe('the verifier survives the round trip', () => {
  it('comes back out of pending state at callback time', () => {
    // The verifier never leaves the server: the challenge travels through the
    // customer's browser, the verifier waits here keyed by `state`.
    const state = generateState()
    const { verifier } = generatePkcePair()
    storePendingState(state, 'shipbob', { vertical: 'logistics', codeVerifier: verifier })

    expect(consumePendingState(state)?.codeVerifier).toBe(verifier)
  })

  it('is null for a flow that did not use PKCE', () => {
    const state = generateState()
    storePendingState(state, 'fortnox', { vertical: 'accounting' })
    expect(consumePendingState(state)?.codeVerifier).toBeNull()
  })

  it('is consumed with the state, so a replayed code finds nothing', () => {
    const state = generateState()
    storePendingState(state, 'shipbob', { codeVerifier: 'v' })
    expect(consumePendingState(state)).not.toBeNull()
    expect(consumePendingState(state)).toBeNull()
  })
})
