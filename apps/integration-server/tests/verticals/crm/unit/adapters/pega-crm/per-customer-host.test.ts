/**
 * Pega is hosted per customer (Pega Cloud or on-premises): authorize, token
 * and API all live under the customer's own `/prweb`. The adapter read that
 * host from deployment-level config — which the admin UI cannot set — so
 * every Connect Link died on `new URL('/prweb/PRRestService/oauth2/v1/authorize')`.
 *
 * The base URL is now an `oauthField`. Because it is free-form, it must be
 * https and must resolve to a public address before any request carrying the
 * client secret or a token is made to it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { PegaCrmAdapter } from '../../../../../../src/verticals/crm/adapters/pega-crm/index'
import { normaliseBaseUrl } from '../../../../../../src/verticals/crm/adapters/pega-crm/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/crm/pega-crm/callback',
}

const REQUIRED = 'Pega base URL is required (e.g. https://acme.pegacloud.io).'
const NOT_HTTPS = 'Pega base URL must use https://.'
const INVALID = 'Pega base URL must be a valid https:// URL.'
const USERINFO = 'Pega base URL must not contain a username or password.'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
})

afterEach(() => {
  setDnsResolver(undefined)
  vi.unstubAllGlobals()
})

describe('normaliseBaseUrl', () => {
  it.each([
    ['https://acme.pegacloud.io', 'https://acme.pegacloud.io'],
    ['https://ACME.pegacloud.io/', 'https://acme.pegacloud.io'],
    ['acme.pegacloud.io', 'https://acme.pegacloud.io'],
    ['https://acme.pegacloud.io/prweb/app/default/', 'https://acme.pegacloud.io'],
  ])('%s → %s', (input, want) => {
    expect(normaliseBaseUrl(input)).toBe(want)
  })

  it('rejects blanks', () => {
    expect(() => normaliseBaseUrl('')).toThrow(REQUIRED)
    expect(() => normaliseBaseUrl(undefined)).toThrow(REQUIRED)
  })

  it('rejects anything but a plain https URL', () => {
    expect(() => normaliseBaseUrl('http://acme.pegacloud.io')).toThrow(NOT_HTTPS)
    expect(() => normaliseBaseUrl('https://')).toThrow(INVALID)
    expect(() => normaliseBaseUrl('https://user:pw@acme.pegacloud.io')).toThrow(USERINFO)
  })
})

describe('PegaCrmAdapter with a per-customer host', () => {
  const adapter = new PegaCrmAdapter(CFG)

  it('declares the base URL as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'baseUrl', required: true, type: 'url' }),
    ])
  })

  it('builds the authorize URL on the customer’s host', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, { baseUrl: 'acme.pegacloud.io' }),
    )
    expect(u.origin).toBe('https://acme.pegacloud.io')
    expect(u.pathname).toBe('/prweb/PRRestService/oauth2/v1/authorize')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('refuses to build an authorize URL with no host known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('exchanges the code on the customer’s host and stores the normalised URL in extra', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ access_token: 'tok', refresh_token: 'rt', expires_in: 3600 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      baseUrl: 'https://ACME.pegacloud.io/prweb/',
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://acme.pegacloud.io/prweb/PRRestService/oauth2/v1/token',
    )
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toMatchObject({ baseUrl: 'https://acme.pegacloud.io' })
  })

  it('rejects a plain-http host before any request is made', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { baseUrl: 'http://acme.pegacloud.io' }),
    ).rejects.toThrow(NOT_HTTPS)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a host that resolves to a private address before the secret is sent', async () => {
    setDnsResolver(async () => [{ address: '127.0.0.1' }])
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { baseUrl: 'https://pega.corp.example' }),
    ).rejects.toThrow('SSRF block: pega.corp.example resolved to 127.0.0.1')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes on the host stored with the credentials, not on config', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: 'new', expires_in: 3600 }))
    vi.stubGlobal('fetch', fetchMock)
    await new PegaCrmAdapter({ ...CFG, baseUrl: 'https://other.example.com' }).refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      extra: { baseUrl: 'https://acme.pegacloud.io' },
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://acme.pegacloud.io/prweb/PRRestService/oauth2/v1/token',
    )
  })

  it('calls the API on the host stored with the credentials, not on config', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ pxResults: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await new PegaCrmAdapter({ ...CFG, baseUrl: 'https://other.example.com' })
      .listContacts({ accessToken: 'tok', extra: { baseUrl: 'https://acme.pegacloud.io' } }, {})
      .catch(() => undefined) // the response handling is not under test
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0]
    expect(url.startsWith('https://acme.pegacloud.io/prweb/api/v1/')).toBe(true)
  })
})
