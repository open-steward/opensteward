import { describe, it, expect, vi, afterEach } from 'vitest'
import { exchangeCredentials } from '../../../../../../src/verticals/logistics/adapters/easyship/auth'
import { EASYSHIP_TOKEN_URL } from '../../../../../../src/verticals/logistics/adapters/easyship/constants'

/**
 * The client_credentials exchange POSTed to
 * `https://api.easyship.com/oauth/token`, which does not exist — every
 * connection attempt failed before it began.
 *
 * Verified by unauthenticated live probe (2026-09-15), which distinguishes a
 * wrong path from a missing credential without needing either:
 *
 *   POST /oauth/token   -> 404 {"error":"Route not found"}
 *   POST /oauth2/token  -> 401 {"error":"invalid_client", ...}
 *
 * A 401 `invalid_client` is a real OAuth2 token endpoint answering a
 * credential-less request correctly; a 404 is not an endpoint at all. The
 * vendor's own reference documents `oauth2`
 * (https://developers.easyship.com/reference/oauth2_token).
 *
 * The same one-character slip is not unique to this constant — `/oauth2/
 * authorize` answers 401 where `/oauth/authorize` 404s — and constants.ts
 * already carries a header recording an earlier live probe that corrected the
 * API base and left this line untouched. Hence a test on the wire, not on the
 * string alone.
 */

afterEach(() => vi.restoreAllMocks())

describe('easyship client_credentials exchange', () => {
  it('posts to the oauth2 token path that exists, not the oauth one that 404s', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 't', token_type: 'Bearer', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await exchangeCredentials({ clientId: 'id', clientSecret: 'secret' })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.host).toBe('api.easyship.com')
    expect(url.pathname).toBe('/oauth2/token')
  })

  it('names the oauth2 path in the exported constant', () => {
    expect(EASYSHIP_TOKEN_URL).toBe('https://api.easyship.com/oauth2/token')
  })

  it('still sends the client_credentials grant as form-encoded', async () => {
    // Pinned alongside the path: the probe above only proves the endpoint
    // exists, and a form-encoded client_credentials body is what makes it
    // answer with a token rather than invalid_request.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 't', token_type: 'Bearer', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await exchangeCredentials({ clientId: 'id', clientSecret: 'secret', scope: 'shipment' })

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    const sent = new URLSearchParams(String(init.body))
    expect(sent.get('grant_type')).toBe('client_credentials')
    expect(sent.get('client_id')).toBe('id')
    expect(sent.get('scope')).toBe('shipment')
  })
})
