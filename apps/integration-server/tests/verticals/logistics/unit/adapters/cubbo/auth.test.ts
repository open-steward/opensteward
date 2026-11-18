/**
 * Cubbo token exchange. First-party docs (developers.cubbo.com, "Auth - Get
 * token"): POST https://api.cubbo.com/v1/auth/token with a raw JSON body
 * { "client_id", "client_secret" }; the 200 example is
 * { "token": "...", "expires_in": 86400, "type": "Bearer" }; "There are no
 * refresh tokens ... request a new one by calling this endpoint again".
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  credentialFields,
  exchangeCredentials,
  refreshCredentials,
} from '../../../../../../src/verticals/logistics/adapters/cubbo/auth'

const fetchMock = vi.fn()

function tokenResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('cubbo auth', () => {
  it('asks for a client id and a client secret', () => {
    expect(credentialFields().map((f) => f.name)).toEqual(['clientId', 'clientSecret'])
  })

  it('POSTs JSON to /v1/auth/token and stores the documented token field', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(
      tokenResponse({ token: 'eyJ.tok', expires_in: 86400, type: 'Bearer' }),
    )
    const before = Date.now()
    const creds = await exchangeCredentials({ clientId: 'cid', clientSecret: 'sec' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.cubbo.com/v1/auth/token')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({ client_id: 'cid', client_secret: 'sec' })
    expect(creds.accessToken).toBe('eyJ.tok')
    expect(creds.refreshToken).toBeUndefined()
    expect(creds.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 86400 * 1000)
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'sec' })
  })

  it('throws when the response carries no token', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(tokenResponse({ access_token: 'x' }))
    await expect(exchangeCredentials({ clientId: 'cid', clientSecret: 'sec' })).rejects.toThrow(
      /no token/,
    )
  })

  it('throws on a non-2xx token response', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(tokenResponse({ error: 'invalid' }, 401))
    await expect(exchangeCredentials({ clientId: 'cid', clientSecret: 'sec' })).rejects.toThrow(
      /401/,
    )
  })

  it('refresh re-runs the exchange with the stored id and secret', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(tokenResponse({ token: 'new', expires_in: 60, type: 'Bearer' }))
    const out = await refreshCredentials({
      accessToken: 'old',
      extra: { clientId: 'cid', clientSecret: 'sec' },
    })
    expect(out.accessToken).toBe('new')
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      client_id: 'cid',
      client_secret: 'sec',
    })
  })
})
