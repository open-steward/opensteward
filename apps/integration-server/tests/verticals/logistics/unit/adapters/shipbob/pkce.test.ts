import { describe, it, expect } from 'vitest'
import { ShipBobAdapter } from '../../../../../../src/verticals/logistics/adapters/shipbob/index'
import { buildAuthUrl } from '../../../../../../src/verticals/logistics/adapters/shipbob/auth'
import { DEFAULT_SCOPES } from '../../../../../../src/verticals/logistics/adapters/shipbob/constants'

/**
 * Connecting ShipBob produced `auth.shipbob.com/home/error?errorId=…` and
 * nothing else. ShipBob's IdentityServer documents `code_challenge` and
 * `code_challenge_method=S256` as REQUIRED, and the adapter sent neither, so
 * the authorize request was refused before any consent screen — no callback,
 * therefore no `error=` parameter to read.
 *
 * These assert the query string itself, because that string is the entire
 * contract with the provider and it is not otherwise observable until a human
 * clicks through.
 */

const CFG = {
  clientId: 'ExternalApplication_ae705999',
  clientSecret: 'shh',
  redirectUri: 'http://localhost:3010/auth/logistics/shipbob/callback',
}

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams
}

describe('the authorize URL', () => {
  it('carries code_challenge and S256 when a challenge is supplied', () => {
    const p = paramsOf(buildAuthUrl(CFG, 'state-1', 'CHALLENGE'))
    expect(p.get('code_challenge')).toBe('CHALLENGE')
    expect(p.get('code_challenge_method')).toBe('S256')
  })

  it('omits both when no challenge is supplied', () => {
    // A half-PKCE request — method without challenge, or vice versa — is
    // rejected the same way the missing pair was.
    const p = paramsOf(buildAuthUrl(CFG, 'state-1'))
    expect(p.has('code_challenge')).toBe(false)
    expect(p.has('code_challenge_method')).toBe(false)
  })

  it('still sends everything ShipBob documents as required', () => {
    const p = paramsOf(buildAuthUrl(CFG, 'state-1', 'CHALLENGE'))
    for (const required of [
      'client_id',
      'response_type',
      'scope',
      'redirect_uri',
      'code_challenge',
      'code_challenge_method',
    ]) {
      expect(p.get(required), `missing ${required}`).toBeTruthy()
    }
    expect(p.get('response_type')).toBe('code')
  })

  it('points at ShipBob’s IdentityServer authorize endpoint', () => {
    expect(buildAuthUrl(CFG, 's')).toMatch(/^https:\/\/auth\.shipbob\.com\/connect\/authorize\?/)
  })

  it('requests only scopes ShipBob publishes', () => {
    // Every default scope, checked against the documented set. An unknown
    // scope is refused by the same error page, so a typo here is as fatal as
    // the missing PKCE was and just as silent.
    const documented = new Set([
      'billing_read', 'channels_read', 'fulfillments_read', 'fulfillments_write',
      'inventory_read', 'inventory_write', 'locations_read', 'locations_write',
      'orders_read', 'orders_write', 'pricing_read', 'products_read',
      'products_write', 'receiving_read', 'receiving_write', 'returns_read',
      'returns_write', 'webhooks_read', 'webhooks_write', 'offline_access',
    ])
    expect(DEFAULT_SCOPES.filter((s) => !documented.has(s))).toEqual([])
  })
})

describe('the adapter declares what the flow needs', () => {
  it('declares requiresPkce, which is what makes the router mint a pair', () => {
    // Without the declaration the router sends no challenge and the adapter's
    // support for one is never reached.
    expect(new ShipBobAdapter().capabilities?.requiresPkce).toBe(true)
  })

  it('implements exchangeCodeWithVerifier', () => {
    // The callback prefers this whenever a verifier is in flight. An adapter
    // declaring requiresPkce without it would authorize successfully and then
    // fail the exchange.
    expect(typeof new ShipBobAdapter().exchangeCodeWithVerifier).toBe('function')
  })

  it('threads the challenge through getAuthUrl', () => {
    const url = new ShipBobAdapter({ ...CFG }).getAuthUrl('state-1', undefined, 'CHALLENGE')
    expect(paramsOf(url).get('code_challenge')).toBe('CHALLENGE')
  })

  it('keeps honouring a scope override alongside PKCE', () => {
    const url = new ShipBobAdapter({ ...CFG }).getAuthUrl('s', ['orders_read'], 'CHALLENGE')
    const p = paramsOf(url)
    expect(p.get('scope')).toBe('orders_read')
    expect(p.get('code_challenge')).toBe('CHALLENGE')
  })
})

describe('the OAuth environment', () => {
  it('uses production by default', () => {
    expect(buildAuthUrl(CFG, 's')).toMatch(/^https:\/\/auth\.shipbob\.com\//)
  })

  it('uses staging when sandbox is set', () => {
    // Measured, not assumed. With one identical client_id, redirect_uri and
    // scope:
    //   auth.shipbob.com       302 -> /home/error     (rejected)
    //   authstage.shipbob.com  302 -> /Account/Login  (accepted)
    // An app exists in exactly one environment, and the production endpoint
    // refuses a staging client with a page that names no cause — identical to
    // the page shown for a bad redirect_uri or a missing code_challenge.
    expect(buildAuthUrl({ ...CFG, sandbox: true }, 's')).toMatch(
      /^https:\/\/authstage\.shipbob\.com\//,
    )
  })

  it('keeps PKCE and scopes intact in sandbox', () => {
    const p = paramsOf(buildAuthUrl({ ...CFG, sandbox: true }, 's', 'CHALLENGE'))
    expect(p.get('code_challenge')).toBe('CHALLENGE')
    expect(p.get('code_challenge_method')).toBe('S256')
    expect(p.get('client_id')).toBe(CFG.clientId)
  })

  it('threads sandbox from adapter config through to the URL', () => {
    const url = new ShipBobAdapter({ ...CFG, sandbox: true }).getAuthUrl('s')
    expect(url).toMatch(/^https:\/\/authstage\.shipbob\.com\//)
  })

  it('defaults to production when the adapter is given no flag', () => {
    expect(new ShipBobAdapter({ ...CFG }).getAuthUrl('s')).toMatch(
      /^https:\/\/auth\.shipbob\.com\//,
    )
  })
})
