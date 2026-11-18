/**
 * Nitro Sign authentication, rebuilt onto the documented client-credentials
 * flow.
 *
 * Sources (fetched from the first-party docs):
 * - https://developers.gonitro.com/docs/authentication/credentials.md —
 *   "The Nitro APIs use machine-to-machine OAuth with the client credentials
 *   grant type to generate access tokens". Each customer creates the
 *   application in their own Admin Portal, so the pair is per connection.
 * - https://developers.gonitro.com/docs/authentication/token-renew.md —
 *   `curl -X POST https://api.gonitro.dev/oauth/token -H "Content-Type:
 *   application/json" -d '{"clientID": "<nitro_app_id>", "clientSecret":
 *   "<your_app_secret>"}'`, answered by `{"accessToken": …, "tokenType":
 *   "Bearer", "expiresIn": 86400}`. Renew "when needed"; no refresh token.
 * - https://api.gonitro.dev/openapi.json — `POST /oauth/token` (`security:
 *   []`) under the regional `servers` Europe / North America / Australia;
 *   `AuthTokenRequest` requires `clientID` + `clientSecret`;
 *   `AuthTokenResponse.expiresIn` is "Token expiration time in seconds".
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios, { AxiosError, AxiosHeaders } from 'axios'
import { classifyRefreshError } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { NitroSignClient } from '../../../../../../src/verticals/docsign/adapters/nitro-sign/client'
import { NitroSignAdapter } from '../../../../../../src/verticals/docsign/adapters/nitro-sign'

const EU = 'https://api.gonitro.dev'
const US = 'https://api.us.gonitro.dev'
const AU = 'https://api.au.gonitro.dev'
const NOW = new Date('2026-09-25T12:00:00Z')

/** The token-renew guide's response example, verbatim. */
const TOKEN_RESPONSE = {
  accessToken:
    'eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQGV4YW1wbGUuY29tIiwiaWF0IjoxNjQyNzg5MjAwLCJleHAiOjE2NDI4NzU2MDB9.signature_here',
  tokenType: 'Bearer',
  expiresIn: 86400,
}

const adapter = new NitroSignAdapter()

const FIELDS = { signApiBaseUrl: US, clientId: 'nitro_app_id', clientSecret: 'app_secret' }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function mockTokenPost(body: unknown = TOKEN_RESPONSE) {
  return vi.spyOn(axios, 'post').mockResolvedValue({ data: body, status: 200 } as never)
}

const STORED: Credentials = {
  accessToken: 'old',
  expiresAt: new Date(NOW.getTime() - 1000),
  extra: { signApiBaseUrl: AU, clientId: 'nitro_app_id', clientSecret: 'app_secret' },
}

/** An axios token-endpoint failure whose request config carries the secret, as a real one does. */
function tokenError(status: number | undefined, code: string): AxiosError {
  const config = {
    headers: new AxiosHeaders(),
    data: JSON.stringify({ clientID: 'nitro_app_id', clientSecret: 'app_secret' }),
  }
  return new AxiosError(
    status === undefined
      ? 'timeout of 30000ms exceeded'
      : `Request failed with status code ${status}`,
    code,
    config as never,
    undefined,
    status === undefined
      ? undefined
      : ({
          status,
          statusText: '',
          data: status < 500 ? { error: 'invalid_client' } : {},
          headers: {},
          config,
        } as never),
  )
}

function expectNoSecret(thrown: unknown) {
  expect(thrown).not.toBeInstanceOf(AxiosError)
  expect((thrown as { config?: unknown }).config).toBeUndefined()
  expect(JSON.stringify(thrown)).not.toContain('app_secret')
  expect((thrown as Error).message).not.toContain('app_secret')
}

describe('NitroSignAdapter.credentialFields', () => {
  it('asks for the region host, client ID and client secret', () => {
    const fields = adapter.credentialFields()
    expect(fields.map((f) => [f.name, f.type, f.required])).toEqual([
      ['signApiBaseUrl', 'select', true],
      ['clientId', 'text', true],
      ['clientSecret', 'password', true],
    ])
    expect(fields[0]!.options).toEqual([
      { value: EU, label: 'Europe' },
      { value: US, label: 'North America' },
      { value: AU, label: 'Australia' },
    ])
  })
})

describe('NitroSignAdapter.exchangeCredentials → POST {region}/oauth/token', () => {
  it('posts the documented JSON body to the region host and stores the grant inputs', async () => {
    const post = mockTokenPost()
    const creds = await adapter.exchangeCredentials(FIELDS)

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe(`${US}/oauth/token`)
    expect(body).toEqual({ clientID: 'nitro_app_id', clientSecret: 'app_secret' })
    expect(config).toMatchObject({ headers: { 'Content-Type': 'application/json' } })
    expect((config?.headers as Record<string, unknown>)['Authorization']).toBeUndefined()

    expect(creds).toEqual({
      accessToken: TOKEN_RESPONSE.accessToken,
      expiresAt: new Date(NOW.getTime() + 86400 * 1000),
      extra: { signApiBaseUrl: US, clientId: 'nitro_app_id', clientSecret: 'app_secret' },
    })
    expect(creds.refreshToken).toBeUndefined()
  })

  it.each([EU, US, AU])('uses the token endpoint of region %s', async (host) => {
    const post = mockTokenPost()
    const creds = await adapter.exchangeCredentials({ ...FIELDS, signApiBaseUrl: host })
    expect(post.mock.calls[0]![0]).toBe(`${host}/oauth/token`)
    expect(creds.extra?.['signApiBaseUrl']).toBe(host)
  })

  it('never calls the invented api.nitro.com host', async () => {
    const post = mockTokenPost()
    await adapter.exchangeCredentials(FIELDS)
    expect(String(post.mock.calls[0]![0])).not.toMatch(/api\.nitro\.com/)
  })

  it.each([
    ['missing region', { clientId: 'a', clientSecret: 'b' }, /signApiBaseUrl/],
    [
      'undocumented region',
      { ...FIELDS, signApiBaseUrl: 'https://api.nitro.com' },
      /signApiBaseUrl/,
    ],
    ['missing client ID', { signApiBaseUrl: US, clientSecret: 'b' }, /Client ID/],
    ['missing client secret', { signApiBaseUrl: US, clientId: 'a' }, /Client secret/],
  ])('refuses before sending on %s', async (_label, fields, message) => {
    const post = mockTokenPost()
    await expect(adapter.exchangeCredentials(fields as Record<string, string>)).rejects.toThrow(
      message,
    )
    expect(post).not.toHaveBeenCalled()
  })

  it.each([
    ['RFC 6749 snake_case only', { access_token: 'x', token_type: 'Bearer', expires_in: 60 }],
    ['no accessToken', { tokenType: 'Bearer', expiresIn: 86400 }],
    ['no expiresIn', { accessToken: 'x', tokenType: 'Bearer' }],
    // AuthTokenResponse.expiresIn is `type: integer`.
    ['a string expiresIn', { accessToken: 'x', tokenType: 'Bearer', expiresIn: '86400' }],
  ])('rejects a token response with %s', async (_label, body) => {
    mockTokenPost(body)
    await expect(adapter.exchangeCredentials(FIELDS)).rejects.toThrow(/accessToken \/ expiresIn/)
  })

  it('a rejected client pair surfaces as a per-connection grant failure without the secret', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(tokenError(401, 'ERR_BAD_REQUEST'))
    const thrown = await adapter.exchangeCredentials(FIELDS).catch((e: unknown) => e)
    expect(thrown).toMatchObject({ statusCode: 401 })
    expect(classifyRefreshError(thrown)).toBe('invalid_grant')
    expectNoSecret(thrown)
  })

  // The spec's 400 response is the RFC 6749 OAuth2ErrorResponse, like the 401.
  it('a 400 from the token endpoint is a per-connection grant failure without the secret', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(tokenError(400, 'ERR_BAD_REQUEST'))
    const thrown = await adapter.exchangeCredentials(FIELDS).catch((e: unknown) => e)
    expect(thrown).toMatchObject({ statusCode: 400 })
    expect(classifyRefreshError(thrown)).toBe('invalid_grant')
    expectNoSecret(thrown)
  })

  it('a 500 from the token endpoint stays transient and drops the secret', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(tokenError(500, 'ERR_BAD_RESPONSE'))
    const thrown = await adapter.refreshCredentials(STORED).catch((e: unknown) => e)
    expect(thrown).toMatchObject({ statusCode: 500 })
    expect(classifyRefreshError(thrown)).toBe('transient')
    expectNoSecret(thrown)
  })

  it('a token request with no response stays transient and drops the secret', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(tokenError(undefined, 'ECONNABORTED'))
    const thrown = await adapter.refreshCredentials(STORED).catch((e: unknown) => e)
    expect(thrown).toMatchObject({ code: 'ECONNABORTED' })
    expect(classifyRefreshError(thrown)).toBe('transient')
    expectNoSecret(thrown)
  })

  it('strips a trailing slash from the region and trims the client ID', async () => {
    const post = mockTokenPost()
    const creds = await adapter.exchangeCredentials({
      ...FIELDS,
      signApiBaseUrl: `${US}/`,
      clientId: '  nitro_app_id  ',
    })
    expect(post.mock.calls[0]![0]).toBe(`${US}/oauth/token`)
    expect(post.mock.calls[0]![1]).toEqual({ clientID: 'nitro_app_id', clientSecret: 'app_secret' })
    expect(creds.extra).toMatchObject({ signApiBaseUrl: US, clientId: 'nitro_app_id' })
  })
})

describe('NitroSignAdapter.refreshCredentials re-runs the grant', () => {
  const stored = STORED

  it('posts the stored pair to the stored region and returns a fresh token', async () => {
    const post = mockTokenPost()
    const next = await adapter.refreshCredentials(stored)
    expect(post.mock.calls[0]![0]).toBe(`${AU}/oauth/token`)
    expect(post.mock.calls[0]![1]).toEqual({ clientID: 'nitro_app_id', clientSecret: 'app_secret' })
    expect(next.accessToken).toBe(TOKEN_RESPONSE.accessToken)
    expect(next.expiresAt).toEqual(new Date(NOW.getTime() + 86400 * 1000))
    expect(next.extra).toEqual(stored.extra)
  })

  it('a connection without a stored client pair must reconnect', async () => {
    const post = mockTokenPost()
    const thrown = await adapter
      .refreshCredentials({ accessToken: 'old', extra: { signApiBaseUrl: AU } })
      .catch((e: unknown) => e)
    expect(classifyRefreshError(thrown)).toBe('invalid_grant')
    expect(post).not.toHaveBeenCalled()
  })

  it.each([
    ['only a client ID', { signApiBaseUrl: AU, clientId: 'nitro_app_id' }],
    ['only a client secret', { signApiBaseUrl: AU, clientSecret: 'app_secret' }],
    ['a pair but no region', { clientId: 'nitro_app_id', clientSecret: 'app_secret' }],
    [
      'a pair and an undocumented region',
      {
        signApiBaseUrl: 'https://api.nitro.com',
        clientId: 'nitro_app_id',
        clientSecret: 'app_secret',
      },
    ],
  ])('a connection storing %s must reconnect, without sending', async (_label, extra) => {
    const post = mockTokenPost()
    const thrown = await adapter
      .refreshCredentials({ accessToken: 'old', extra })
      .catch((e: unknown) => e)
    expect(classifyRefreshError(thrown)).toBe('invalid_grant')
    expect(post).not.toHaveBeenCalled()
  })
})

describe('NitroSignAdapter has no authorization-code flow', () => {
  it('getAuthUrl refuses', () => {
    expect(() => adapter.getAuthUrl('state')).toThrow(/client credentials/)
  })

  it('exchangeCode refuses without sending', async () => {
    const post = mockTokenPost()
    await expect(adapter.exchangeCode('code', 'https://x/cb')).rejects.toThrow(/client credentials/)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('credentials from the token exchange drive the Sign API reads', () => {
  it('listSigners reaches the region host with the minted bearer token', async () => {
    mockTokenPost()
    const creds = await adapter.exchangeCredentials(FIELDS)
    const instance = { get: vi.fn(async () => ({ data: { items: [] } })) }
    const create = vi.spyOn(axios, 'create').mockReturnValue(instance as never)
    await expect(adapter.listSigners(creds, 'env-1', {})).resolves.toEqual([])
    expect(create.mock.calls[0]![0]).toMatchObject({
      baseURL: US,
      headers: { Authorization: `Bearer ${TOKEN_RESPONSE.accessToken}` },
    })
  })

  it('envelope reads send the token only to the region host', async () => {
    const creds: Credentials = { accessToken: 'jwt', extra: { signApiBaseUrl: EU } }
    const instance = { get: vi.fn(async () => ({ data: { items: [] } })) }
    const create = vi.spyOn(axios, 'create').mockReturnValue(instance as never)
    await adapter.listEnvelopes(creds, {}).catch(() => undefined)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]![0]).toMatchObject({ baseURL: EU })
  })

  it('envelope reads refuse before sending when the connection has no region', async () => {
    const create = vi.spyOn(axios, 'create')
    const get = vi.spyOn(NitroSignClient.prototype, 'get')
    await expect(adapter.listEnvelopes({ accessToken: 'jwt' }, {})).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(create).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })
})
