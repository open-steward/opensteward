/**
 * Endicia (SERA) OAuth2 authorization-code flow.
 *
 * First-party reference: https://developer.stamps.com/rest-api/reference/serav1.html
 *
 *   "Sign-In/Authentication
 *    Staging: https://signin.testing.stampsendicia.com
 *    Production: https://signin.stampsendicia.com"
 *
 *   SERA (Production) authorizationCode OAuth Flow
 *     "Authorization URL: https://signin.stampsendicia.com/authorize"
 *     "Token URL: https://signin.stampsendicia.com/oauth/token"
 *     "Refresh URL: https://signin.stampsendicia.com/oauth/token"
 *   SERA (Staging) — the same paths on https://signin.testing.stampsendicia.com
 *
 *   Login: "`response_type` = `code`", "`client_id` = value specific to
 *   individual application/integration", "`redirect_uri` = value specific to
 *   individual application/integration", "`scope` = `offline_access`
 *   (required to receive a refresh token)"
 *
 *   POST /oauth/token (application/json), oneOf:
 *     { grant_type: "authorization_code", client_id, client_secret, code,
 *       redirect_uri } — redirect_uri "Must match the `redirect_uri` value
 *       used in the /authorize call."
 *     { grant_type: "refresh_token", client_id, client_secret, refresh_token }
 *   200: access_token, refresh_token, id_token, token_type, expires_in
 *     ("_Expires In_<br/>Access token expires in these many seconds", typed
 *     string).
 *
 *   "A valid `access_token` is required for every SERA call and is expected to
 *    regularly expire. Once an `access_token` has expired or is
 *    near-expiration, the integration should used the stored `refresh_token`
 *    to call for a new `access_token` by calling the `/oauth/token` endpoint
 *    again."
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { isTokenExpired } from '@opensteward/shared'
import { EndiciaAdapter } from '../../../../../../src/verticals/logistics/adapters/endicia/index'

const CONFIG = {
  clientId: 'op-client-id',
  clientSecret: 'op-client-secret',
  redirectUri: 'https://steward.example.com/auth/logistics/endicia/callback',
}

const NOW = new Date('2026-09-25T12:00:00Z')

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      access_token: 'sera-access-1',
      refresh_token: 'sera-refresh-1',
      id_token: 'id-token',
      token_type: 'Bearer',
      expires_in: '3600',
      ...overrides,
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Endicia getAuthUrl', () => {
  it('builds the documented production /authorize URL with the operator client and offline_access', () => {
    const url = new URL(new EndiciaAdapter(CONFIG).getAuthUrl('state-123'))
    expect(`${url.origin}${url.pathname}`).toBe('https://signin.stampsendicia.com/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('op-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri)
    expect(url.searchParams.get('scope')).toBe('offline_access')
    expect(url.searchParams.get('state')).toBe('state-123')
    expect([...url.searchParams.keys()].sort()).toEqual(
      ['client_id', 'redirect_uri', 'response_type', 'scope', 'state'].sort(),
    )
  })

  it('sends a Connect Link scope override in place of offline_access', () => {
    const adapter = new EndiciaAdapter(CONFIG)
    expect(
      new URL(adapter.getAuthUrl('s', ['offline_access', 'x'])).searchParams.get('scope'),
    ).toBe('offline_access x')
    expect(new URL(adapter.getAuthUrl('s', [])).searchParams.get('scope')).toBe('offline_access')
  })

  it('uses the documented staging signin host when sandbox is set', () => {
    const url = new URL(new EndiciaAdapter({ ...CONFIG, sandbox: true }).getAuthUrl('s'))
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://signin.testing.stampsendicia.com/authorize',
    )
  })

  it('refuses to build a URL without the operator client ID or redirect URI', () => {
    expect(() => new EndiciaAdapter({ redirectUri: CONFIG.redirectUri }).getAuthUrl('s')).toThrow(
      /clientId/,
    )
    expect(() => new EndiciaAdapter({ clientId: 'x' }).getAuthUrl('s')).toThrow(/redirectUri/)
  })

  it('no longer offers a pasted-API-key form', () => {
    const adapter = new EndiciaAdapter(CONFIG) as unknown as Record<string, unknown>
    expect(adapter.credentialFields).toBeUndefined()
    expect(adapter.exchangeCredentials).toBeUndefined()
  })
})

describe('Endicia exchangeCode', () => {
  it('POSTs the documented authorization_code grant as JSON to the production token URL', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue(tokenResponse())
    const creds = await new EndiciaAdapter(CONFIG).exchangeCode('auth-code-1', CONFIG.redirectUri)

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, options] = post.mock.calls[0]!
    expect(url).toBe('https://signin.stampsendicia.com/oauth/token')
    expect(body).toEqual({
      grant_type: 'authorization_code',
      client_id: 'op-client-id',
      client_secret: 'op-client-secret',
      code: 'auth-code-1',
      redirect_uri: CONFIG.redirectUri,
    })
    expect((options?.headers as Record<string, string>)['Content-Type']).toBe('application/json')

    expect(creds.accessToken).toBe('sera-access-1')
    expect(creds.refreshToken).toBe('sera-refresh-1')
    expect(creds.expiresAt?.toISOString()).toBe('2026-09-25T13:00:00.000Z')
  })

  it('sends the redirect_uri used at /authorize, which the token endpoint requires to match', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue(tokenResponse())
    await new EndiciaAdapter(CONFIG).exchangeCode('c', 'https://other.example.com/cb')
    expect((post.mock.calls[0]![1] as Record<string, string>).redirect_uri).toBe(CONFIG.redirectUri)
  })

  it('uses the staging token URL when sandbox is set', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue(tokenResponse())
    await new EndiciaAdapter({ ...CONFIG, sandbox: true }).exchangeCode('c', CONFIG.redirectUri)
    expect(post.mock.calls[0]![0]).toBe('https://signin.testing.stampsendicia.com/oauth/token')
  })

  it('rejects a token response without an access_token', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { token_type: 'Bearer' } })
    await expect(new EndiciaAdapter(CONFIG).exchangeCode('c', CONFIG.redirectUri)).rejects.toThrow()
  })

  it('refuses to exchange without the operator client secret', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      new EndiciaAdapter({ clientId: 'x', redirectUri: CONFIG.redirectUri }).exchangeCode('c', ''),
    ).rejects.toThrow(/clientSecret/)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('Endicia refreshCredentials', () => {
  const stored = {
    accessToken: 'sera-access-old',
    refreshToken: 'sera-refresh-1',
    expiresAt: new Date('2026-09-25T11:59:30Z'),
  }

  it('POSTs the documented refresh_token grant with the operator client', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue(
        tokenResponse({ access_token: 'sera-access-2', refresh_token: 'sera-refresh-2' }),
      )
    const creds = await new EndiciaAdapter(CONFIG).refreshCredentials(stored)

    const [url, body] = post.mock.calls[0]!
    expect(url).toBe('https://signin.stampsendicia.com/oauth/token')
    expect(body).toEqual({
      grant_type: 'refresh_token',
      client_id: 'op-client-id',
      client_secret: 'op-client-secret',
      refresh_token: 'sera-refresh-1',
    })
    expect(creds.accessToken).toBe('sera-access-2')
    expect(creds.refreshToken).toBe('sera-refresh-2')
    expect(creds.expiresAt?.toISOString()).toBe('2026-09-25T13:00:00.000Z')
  })

  it('keeps the stored refresh token when the refresh response does not rotate it', async () => {
    const response = tokenResponse({ access_token: 'sera-access-2' })
    delete (response.data as Record<string, unknown>).refresh_token
    vi.spyOn(axios, 'post').mockResolvedValue(response)
    const creds = await new EndiciaAdapter(CONFIG).refreshCredentials(stored)
    expect(creds.refreshToken).toBe('sera-refresh-1')
  })

  it('carries the other stored connection fields through a refresh', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(tokenResponse({ access_token: 'sera-access-2' }))
    const creds = await new EndiciaAdapter(CONFIG).refreshCredentials({
      ...stored,
      tenantId: 'tenant-7',
      webhookSecret: 'whsec-1',
      extra: { accountId: 'acct-42' },
    })
    expect(creds.tenantId).toBe('tenant-7')
    expect(creds.webhookSecret).toBe('whsec-1')
    expect(creds.extra).toEqual({ accountId: 'acct-42' })
  })

  it('uses the staging token URL when sandbox is set', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue(tokenResponse())
    await new EndiciaAdapter({ ...CONFIG, sandbox: true }).refreshCredentials(stored)
    expect(post.mock.calls[0]![0]).toBe('https://signin.testing.stampsendicia.com/oauth/token')
  })

  it('fails loudly, without calling SERA, when there is no refresh token to use', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      new EndiciaAdapter(CONFIG).refreshCredentials({ accessToken: 'a' }),
    ).rejects.toThrow(/refresh token/)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('Endicia token expiry', () => {
  it('an exchanged token reads as expired once expires_in has elapsed, so the middleware refreshes it', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(tokenResponse({ expires_in: '600' }))
    const creds = await new EndiciaAdapter(CONFIG).exchangeCode('c', CONFIG.redirectUri)

    expect(isTokenExpired(creds.expiresAt)).toBe(false)
    vi.setSystemTime(new Date(NOW.getTime() + 600_000))
    expect(isTokenExpired(creds.expiresAt)).toBe(true)
  })

  it('a refreshed connection is used on the next API call', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(tokenResponse({ access_token: 'sera-access-2' }))
    const create = vi.spyOn(axios, 'create')
    create.mockReturnValue({
      get: vi.fn(async () => ({ data: { shipping_options: [] } })),
    } as never)

    const adapter = new EndiciaAdapter(CONFIG)
    const creds = await adapter.refreshCredentials({ accessToken: 'old', refreshToken: 'r' })
    await adapter.listCarriers(creds, {})

    const headers = (create.mock.calls[0]![0] as { headers: Record<string, string> }).headers
    expect(headers.Authorization).toBe('Bearer sera-access-2')
  })
})
