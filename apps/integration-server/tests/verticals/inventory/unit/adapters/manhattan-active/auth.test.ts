import { describe, it, expect, vi, afterEach } from 'vitest'
import { ManhattanActiveAdapter } from '../../../../../../src/verticals/inventory/adapters/manhattan-active/index'

/**
 * Manhattan's "Call from your code" guide
 * (https://developer.manh.com/docs/how-to/rest-api/yourcode/) posts
 * grant_type=password + username + password to
 * https://<environment>-auth.omni.manh.com/oauth/token with the client id and
 * secret as HTTP Basic auth. The platform connects through the credential
 * form, so the per-connection secret must survive into refreshCredentials().
 */

afterEach(() => vi.unstubAllGlobals())

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fields = {
  environment: 'acme',
  clientId: 'cid',
  clientSecret: 'form-secret',
  username: 'u@example.com',
  password: 'pw',
}

describe('manhattan-active credential connection', () => {
  it('runs the password grant against the per-environment token URL with Basic client auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: 'a1', refresh_token: 'r1' }))
    vi.stubGlobal('fetch', fetchMock)

    const creds = await new ManhattanActiveAdapter({}).exchangeCredentials(fields)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://acme-auth.omni.manh.com/oauth/token')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${Buffer.from('cid:form-secret').toString('base64')}`,
    )
    const body = new URLSearchParams(init.body as string)
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'password',
      username: 'u@example.com',
      password: 'pw',
    })
    expect(creds.accessToken).toBe('a1')
  })

  it('refreshes with the secret entered in the form, not operator config', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'a1', refresh_token: 'r1' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'a2' }))
    vi.stubGlobal('fetch', fetchMock)

    // No operator-level clientSecret: a non-oauth2 platform gets none.
    const adapter = new ManhattanActiveAdapter({})
    const first = await adapter.exchangeCredentials(fields)
    const second = await adapter.refreshCredentials(first)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, init] = fetchMock.mock.calls[1]!
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${Buffer.from('cid:form-secret').toString('base64')}`,
    )
    expect(second.accessToken).toBe('a2')
    expect(second.refreshToken).toBe('r1')
  })
})
