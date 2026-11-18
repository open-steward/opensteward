/**
 * Certinal connects with a per-tenant OAuth2 client_credentials grant:
 * POST {apiUrl}/auth/v1/token?grant_type=client_credentials, client auth via
 * HTTP Basic, form body with the required `user_email`, then
 * `Authorization: Bearer` on /rssp/v1 calls.
 * https://certinal.stoplight.io/docs/api/0bc4fc4f90ef6-o-auth-2-0-client-credentials-grant-flow-api
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { setDnsResolver, SsrfBlockedError } from '@opensteward/shared'
import { CertinalAdapter } from '../../../../../../src/verticals/docsign/adapters/certinal'
import {
  expiresAtFrom,
  normaliseApiUrl,
} from '../../../../../../src/verticals/docsign/adapters/certinal/auth'
import { CertinalClient } from '../../../../../../src/verticals/docsign/adapters/certinal/client'

const PUBLIC = async () => [{ address: '93.184.216.34' }]
const PRIVATE = async () => [{ address: '10.0.0.5' }]

function tokenResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () =>
    tokenResponse({
      access_token: 'tok-1',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'rt-1',
      api_access_point: 'https://esign-au-uat.certinal.com/',
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  setDnsResolver(PUBLIC)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

const FIELDS = {
  apiUrl: 'https://esign-staging.certinal.com',
  clientId: 'cid',
  clientSecret: 's3cr3t',
  userEmail: 'api@sample.com',
}

function lastInit(): RequestInit {
  return fetchMock.mock.calls.at(-1)![1] as RequestInit
}

describe('Certinal client-credentials form', () => {
  const adapter = new CertinalAdapter()

  it('collects API URL, client ID, client secret and API user email — no redirect', () => {
    const fields = adapter.credentialFields()
    expect(fields.map((f) => [f.name, f.type, f.required])).toEqual([
      ['apiUrl', 'url', true],
      ['clientId', 'text', true],
      ['clientSecret', 'password', true],
      ['userEmail', 'email', true],
    ])
    expect((adapter as { oauthFields?: unknown }).oauthFields).toBeUndefined()
    expect(() => adapter.getAuthUrl()).toThrow(/no browser OAuth redirect/)
  })

  it('mints a token at /auth/v1/token with Basic client auth and user_email', async () => {
    const before = Date.now()
    const creds = await adapter.exchangeCredentials({
      ...FIELDS,
      apiUrl: '  https://esign-staging.certinal.com/some/path?x=1  ',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://esign-staging.certinal.com/auth/v1/token?grant_type=client_credentials',
    )
    const init = lastInit()
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['authorization']).toBe(`Basic ${Buffer.from('cid:s3cr3t').toString('base64')}`)
    expect(headers['content-type']).toBe('application/x-www-form-urlencoded')
    const body = new URLSearchParams(String(init.body))
    expect(Object.fromEntries(body)).toEqual({ user_email: 'api@sample.com' })

    expect(creds.accessToken).toBe('tok-1')
    expect(creds.refreshToken).toBe('rt-1')
    const exp = creds.expiresAt!.getTime()
    expect(exp).toBeGreaterThanOrEqual(before + 3600_000)
    expect(exp).toBeLessThanOrEqual(Date.now() + 3600_000)
    expect(creds.extra).toEqual({
      apiUrl: 'https://esign-staging.certinal.com',
      apiBaseUrl: 'https://esign-au-uat.certinal.com',
      clientId: 'cid',
      clientSecret: 's3cr3t',
      userEmail: 'api@sample.com',
    })
  })

  it('falls back to the entered API URL when the token has no api_access_point', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'tok', expires_in: 3600 }))
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(creds.extra?.['apiBaseUrl']).toBe('https://esign-staging.certinal.com')
    expect(creds.refreshToken).toBeUndefined()
  })

  it('refuses non-https, credentialed and private API URLs before sending the secret', async () => {
    await expect(
      adapter.exchangeCredentials({ ...FIELDS, apiUrl: 'http://esign-staging.certinal.com' }),
    ).rejects.toThrow(/https/)
    await expect(
      adapter.exchangeCredentials({ ...FIELDS, apiUrl: 'https://u:p@esign-staging.certinal.com' }),
    ).rejects.toThrow(/username or password/)
    await expect(adapter.exchangeCredentials({ ...FIELDS, apiUrl: '' })).rejects.toThrow(/required/)
    expect(fetchMock).not.toHaveBeenCalled()

    setDnsResolver(PRIVATE)
    await expect(adapter.exchangeCredentials(FIELDS)).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires client credentials and the API user email', async () => {
    await expect(adapter.exchangeCredentials({ ...FIELDS, clientSecret: '' })).rejects.toThrow(
      /client secret/,
    )
    await expect(adapter.exchangeCredentials({ ...FIELDS, userEmail: ' ' })).rejects.toThrow(
      /API user email/,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces a token-endpoint error status', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse({ error: 'invalid_client' }, 401))
    await expect(adapter.exchangeCredentials(FIELDS)).rejects.toThrow(/returned 401/)
  })

  it('refuses a token-endpoint redirect instead of replaying the Basic secret', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 307, headers: { location: 'http://collector.example/x' } }),
    )
    await expect(adapter.exchangeCredentials(FIELDS)).rejects.toThrow(/redirected \(307\)/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lastInit().redirect).toBe('manual')
  })

  it('ignores a non-https api_access_point and keeps the entered API URL', async () => {
    fetchMock.mockResolvedValueOnce(
      tokenResponse({ access_token: 'tok', api_access_point: 'http://esign-au-uat.certinal.com/' }),
    )
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(creds.extra?.['apiBaseUrl']).toBe('https://esign-staging.certinal.com')
  })

  it('refreshCredentials re-mints with the stored client credentials', async () => {
    const first = await adapter.exchangeCredentials(FIELDS)
    fetchMock.mockResolvedValueOnce(
      tokenResponse({ access_token: 'tok-2', expires_in: 3600, refresh_token: 'rt-2' }),
    )
    const refreshed = await adapter.refreshCredentials(first)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]![0]).toBe(
      'https://esign-staging.certinal.com/auth/v1/token?grant_type=client_credentials',
    )
    const init = lastInit()
    expect((init.headers as Record<string, string>)['authorization']).toBe(
      `Basic ${Buffer.from('cid:s3cr3t').toString('base64')}`,
    )
    expect(new URLSearchParams(String(init.body)).get('grant_type')).toBeNull()
    expect(new URLSearchParams(String(init.body)).get('user_email')).toBe('api@sample.com')
    expect(refreshed.accessToken).toBe('tok-2')
    expect(refreshed.extra?.['clientSecret']).toBe('s3cr3t')
  })

  it('refreshCredentials refuses a legacy ApiKey connection instead of reusing the key', async () => {
    await expect(
      adapter.refreshCredentials({
        accessToken: 'legacy-key',
        extra: { baseUrl: 'https://x.example' },
      }),
    ).rejects.toThrow(/reconnect/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('expiresAtFrom', () => {
  it('reads documented epoch-millis values as absolute and small values as seconds', () => {
    expect(expiresAtFrom(1643699611236, 0)!.getTime()).toBe(1643699611236)
    expect(expiresAtFrom(3600, 1_000)!.getTime()).toBe(1_000 + 3_600_000)
    expect(expiresAtFrom(undefined)).toBeUndefined()
    expect(expiresAtFrom(0)).toBeUndefined()
  })
})

describe('normaliseApiUrl', () => {
  it('reduces input to an https origin', () => {
    expect(normaliseApiUrl('esign-staging.certinal.com')).toBe('https://esign-staging.certinal.com')
    expect(normaliseApiUrl('https://Esign-AU-UAT.certinal.com/')).toBe(
      'https://esign-au-uat.certinal.com',
    )
  })
})

describe('CertinalClient', () => {
  it('sends Authorization: Bearer to {apiBaseUrl}/rssp/v1', async () => {
    const get = vi.fn(async () => ({ data: { data: { transactionId: 't1' } } }))
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue({ get, post: vi.fn() } as unknown as ReturnType<typeof axios.create>)

    const client = new CertinalClient({
      accessToken: 'tok-1',
      extra: {
        apiUrl: 'https://esign-staging.certinal.com',
        apiBaseUrl: 'https://esign-au-uat.certinal.com',
      },
    })
    await client.get('/transactions/t1')

    const cfg = create.mock.calls[0]![0]!
    expect(cfg.baseURL).toBe('https://esign-au-uat.certinal.com/rssp/v1')
    expect((cfg.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-1')
    expect(cfg.maxRedirects).toBe(0)
    expect(get).toHaveBeenCalledWith('/transactions/t1', { params: undefined })
  })

  it('refuses to call a host that resolves to a private address', async () => {
    const get = vi.fn()
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as unknown as ReturnType<
      typeof axios.create
    >)
    setDnsResolver(PRIVATE)
    const client = new CertinalClient({
      accessToken: 'tok-1',
      extra: { apiUrl: 'https://esign-staging.certinal.com' },
    })
    await expect(client.get('/transactions/t1')).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(get).not.toHaveBeenCalled()
  })
})
