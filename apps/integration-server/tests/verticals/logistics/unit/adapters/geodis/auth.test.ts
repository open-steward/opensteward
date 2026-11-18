/**
 * GenerateToken, from the GEODIS Americas WMS API collection
 * (https://docs.api.geodis.com/api/collections/23261785/2s8YzUyhAw?segregateAuth=true&versionTag=latest):
 * `POST https://auth.ams.geodis.com/realms/sso/protocol/openid-connect/token`,
 * basic auth (username, password), urlencoded `grant_type=client_credentials`,
 * answering `{"access_token": "eyJhb...", "expires_in": 300, ..., "token_type": "bearer"}`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { GeodisAdapter } from '../../../../../../src/verticals/logistics/adapters/geodis/index'
import { ensureFreshToken } from '../../../../../../src/verticals/logistics/adapters/geodis/auth'

const TOKEN_URL = 'https://auth.ams.geodis.com/realms/sso/protocol/openid-connect/token'

function mockToken(token = 'eyJhb...') {
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          access_token: token,
          expires_in: 300,
          refresh_expires_in: 1800,
          refresh_token: 'eyJhbGciOiJI...',
          token_type: 'bearer',
          'not-before-policy': 0,
          session_state: 'ece1c459-...',
          scope: 'roles profile email',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('geodis credentials', () => {
  it('asks for the username, password and Customer ID', () => {
    expect(new GeodisAdapter().credentialFields().map((f) => f.name)).toEqual([
      'username',
      'password',
      'customerId',
    ])
  })

  it('mints a token with basic auth and grant_type=client_credentials', async () => {
    const fetchMock = mockToken()
    const c = await new GeodisAdapter().exchangeCredentials({
      username: 'u',
      password: 'p',
      customerId: '12345',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(TOKEN_URL)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${Buffer.from('u:p').toString('base64')}`,
    )
    expect(String(init.body)).toBe('grant_type=client_credentials')
    expect(c.accessToken).toBe('eyJhb...')
    expect(c.expiresAt).toBeInstanceOf(Date)
    expect(c.extra).toEqual({ username: 'u', password: 'p', customerId: '12345' })
  })

  it('refuses a form without a Customer ID before any request', async () => {
    const fetchMock = mockToken()
    await expect(
      new GeodisAdapter().exchangeCredentials({ username: 'u', password: 'p', customerId: '' }),
    ).rejects.toThrow(/Customer ID/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mints a new token when the current one is about to expire, and not before', async () => {
    const fetchMock = mockToken('fresh')
    const extra = { username: 'u', password: 'p', customerId: '12345' }
    const live = { accessToken: 'old', expiresAt: new Date(Date.now() + 120_000), extra }
    expect(await ensureFreshToken(live)).toBe(live)
    expect(fetchMock).not.toHaveBeenCalled()
    const stale = { accessToken: 'old', expiresAt: new Date(Date.now() + 5_000), extra }
    expect((await ensureFreshToken(stale)).accessToken).toBe('fresh')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
