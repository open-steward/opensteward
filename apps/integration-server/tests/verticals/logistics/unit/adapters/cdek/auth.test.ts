/**
 * CDEK Connect Link auth, from the CDEK API portal spec (apidoc.cdek.ru,
 * operation getOAuthToken, fetched 2026-09-28):
 *
 *   POST /v2/oauth/token — "Авторизация обеспечивается с применением протокола
 *   OAuth 2.0"; grant_type (only value client_credentials), client_id,
 *   client_secret → { access_token, token_type: bearer, expires_in: 3599 }.
 *
 * Per-customer client credentials exchanged for a token, so the platform is
 * `session` and connect must show the credential form.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The shared client-credentials helper captures globalThis.fetch when the
// adapter module loads, so the mock must be installed before any import.
const fetchMock = vi.hoisted(() => {
  const fn = vi.fn()
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
})
import { CdekAdapter } from '../../../../../../src/verticals/logistics/adapters/cdek/index'
import { PLATFORMS } from '../../../../../../src/verticals/logistics/platforms/metadata'

beforeEach(() => {
  fetchMock.mockReset()
})

function stubToken(accessToken: string) {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ access_token: accessToken, token_type: 'bearer', expires_in: 3599 }),
      { status: 200 },
    ),
  )
  return fetchMock
}

describe('CDEK auth', () => {
  it('is labelled session, so connect shows the credential form', () => {
    expect(PLATFORMS.find((p) => p.slug === 'cdek')?.auth_type).toBe('session')
  })

  it('collects client ID and client secret', () => {
    const names = new CdekAdapter().credentialFields().map((f) => f.name)
    expect(names).toEqual(['clientId', 'clientSecret'])
  })

  it('runs the client_credentials grant against /v2/oauth/token', async () => {
    const fetchMock = stubToken('tok')
    const creds = await new CdekAdapter().exchangeCredentials({
      clientId: 'cid',
      clientSecret: 'secret',
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.cdek.ru/v2/oauth/token')
    const params = new URLSearchParams(init.body as string)
    expect(params.get('grant_type')).toBe('client_credentials')
    expect(params.get('client_id')).toBe('cid')
    expect(params.get('client_secret')).toBe('secret')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'secret' })
  })

  it('re-mints the token from stored client credentials on refresh', async () => {
    const fetchMock = stubToken('new')
    const creds = await new CdekAdapter().refreshCredentials({
      accessToken: 'old',
      extra: { clientId: 'cid', clientSecret: 'secret' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(creds.accessToken).toBe('new')
  })
})
