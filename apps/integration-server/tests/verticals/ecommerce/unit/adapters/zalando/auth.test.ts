/**
 * Zalando access tokens come from the API host's /auth/token.
 *
 * https://developers.merchants.zalando.com/docs/requesting-access-token.html:
 * "Use the /auth/token endpoint to request an access token." Its sample
 * request is
 *   POST /auth/token HTTP/1.1
 *   Authorization: Basic ...
 *   Content-Type: application/x-www-form-urlencoded; charset=utf-8
 *   Host: api-sandbox.merchants.zalando.com
 *   grant_type=client_credentials&scope=access_token_only
 * and its sample response carries "access_token", "expires_in": 7200,
 * "scope": "access_token_only" and "token_type": "bearer".
 * Every spec's tokenUrl is https://api.merchants.zalando.com/auth/token
 * (psr-api.yaml, logistic-centers.yaml) or
 * https://api-sandbox.merchants.zalando.com/auth/token (orders.yaml).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { fetchAccessToken } from '../../../../../../src/verticals/ecommerce/adapters/zalando/auth'
import { ZalandoAdapter } from '../../../../../../src/verticals/ecommerce/adapters/zalando/index'

interface Posted {
  url: string
  body: string
  headers: Record<string, string>
}

/** Documented sample response (access token shortened). */
const TOKEN_RESPONSE = {
  access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIn0.payload.sig',
  expires_in: 7200,
  'not-before-policy': 0,
  scope: 'access_token_only',
  session_state: '9c622aa1-54df-4dd4-8dac-421ec80af203',
  token_type: 'bearer',
}

function fakeTokenEndpoint(): Posted[] {
  const posted: Posted[] = []
  vi.spyOn(axios, 'post').mockImplementation((async (
    url: string,
    body: string,
    cfg?: { headers?: Record<string, string> },
  ) => {
    posted.push({ url, body, headers: cfg?.headers ?? {} })
    return { data: TOKEN_RESPONSE }
  }) as never)
  return posted
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Zalando fetchAccessToken', () => {
  it('posts the client-credentials grant to the production /auth/token', async () => {
    const posted = fakeTokenEndpoint()
    const before = Date.now()
    const creds = await fetchAccessToken('my-client', 'my-secret')
    expect(posted).toHaveLength(1)
    expect(posted[0]!.url).toBe('https://api.merchants.zalando.com/auth/token')
    expect(posted[0]!.headers['Authorization']).toBe(
      `Basic ${Buffer.from('my-client:my-secret').toString('base64')}`,
    )
    expect(posted[0]!.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(Object.fromEntries(new URLSearchParams(posted[0]!.body))).toEqual({
      grant_type: 'client_credentials',
      scope: 'access_token_only',
    })
    expect(creds.accessToken).toBe(TOKEN_RESPONSE.access_token)
    expect(creds.scope).toBe('access_token_only')
    const expiresAt = (creds.expiresAt as Date).getTime()
    expect(expiresAt).toBeGreaterThanOrEqual(before + 7200 * 1000)
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 7200 * 1000)
  })

  it('posts to the sandbox /auth/token when sandbox is set', async () => {
    const posted = fakeTokenEndpoint()
    await fetchAccessToken('my-client', 'my-secret', true)
    expect(posted.map((p) => p.url)).toEqual([
      'https://api-sandbox.merchants.zalando.com/auth/token',
    ])
  })

  it('refreshCredentials uses the adapter sandbox flag for the token host', async () => {
    const posted = fakeTokenEndpoint()
    const cfg = { clientId: 'c', clientSecret: 's', merchantId: 'm' }
    await new ZalandoAdapter(cfg).refreshCredentials({ accessToken: 'expired' })
    await new ZalandoAdapter({ ...cfg, sandbox: true }).refreshCredentials({
      accessToken: 'expired',
    })
    expect(posted.map((p) => p.url)).toEqual([
      'https://api.merchants.zalando.com/auth/token',
      'https://api-sandbox.merchants.zalando.com/auth/token',
    ])
  })
})

describe('Zalando Connect Link (operator-level oauth2_cc)', () => {
  it('asks the customer for nothing: the client is operator-configured', () => {
    expect(new ZalandoAdapter().credentialFields()).toEqual([])
  })

  it('exchangeCredentials mints a token from the configured client', async () => {
    const posted = fakeTokenEndpoint()
    const adapter = new ZalandoAdapter({
      clientId: 'op-client',
      clientSecret: 'op-secret',
      merchantId: 'm',
    })
    const creds = await adapter.exchangeCredentials({})
    expect(posted).toHaveLength(1)
    expect(posted[0]!.url).toBe('https://api.merchants.zalando.com/auth/token')
    expect(posted[0]!.headers['Authorization']).toBe(
      `Basic ${Buffer.from('op-client:op-secret').toString('base64')}`,
    )
    expect(creds.accessToken).toBe(TOKEN_RESPONSE.access_token)
  })

  it('refuses the connect before any request when the operator has not configured it', async () => {
    const posted = fakeTokenEndpoint()
    await expect(new ZalandoAdapter().exchangeCredentials({})).rejects.toThrow(/not configured/)
    await expect(
      new ZalandoAdapter({ clientId: 'c', clientSecret: 's' }).exchangeCredentials({}),
    ).rejects.toThrow(/merchantId/)
    expect(posted).toHaveLength(0)
  })
})
