/**
 * Corteza is self-hosted: authorize, token and API all live on the
 * customer's own instance. The adapter read that URL from deployment-level
 * config — which the admin UI cannot set — and otherwise fell back to
 * Corteza's public demo instance, so a customer's Connect Link sent them to
 * `latest.cortezaproject.org` and POSTed this deployment's client secret there.
 *
 * The base URL is now an `oauthField`. Because it is free-form, it must be
 * https and must resolve to a public address before any request carrying the
 * client secret or a token is made to it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { CortezaCrmAdapter } from '../../../../../../src/verticals/crm/adapters/corteza-crm/index'
import { normaliseBaseUrl } from '../../../../../../src/verticals/crm/adapters/corteza-crm/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/crm/corteza-crm/callback',
}

const REQUIRED = 'Corteza base URL is required (e.g. https://corteza.example.com).'
const NOT_HTTPS = 'Corteza base URL must use https://.'
const INVALID = 'Corteza base URL must be a valid https:// URL.'
const USERINFO = 'Corteza base URL must not contain a username or password.'

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
    ['https://corteza.example.com', 'https://corteza.example.com'],
    ['https://Corteza.Example.com/', 'https://corteza.example.com'],
    ['corteza.example.com', 'https://corteza.example.com'],
    ['https://corteza.example.com/compose/ns/crm/pages?x=1#y', 'https://corteza.example.com'],
    ['  https://corteza.example.com:8443/ ', 'https://corteza.example.com:8443'],
  ])('%s → %s', (input, want) => {
    expect(normaliseBaseUrl(input)).toBe(want)
  })

  it('rejects blanks', () => {
    expect(() => normaliseBaseUrl('')).toThrow(REQUIRED)
    expect(() => normaliseBaseUrl('  ')).toThrow(REQUIRED)
    expect(() => normaliseBaseUrl(undefined)).toThrow(REQUIRED)
  })

  it('rejects anything but a plain https URL', () => {
    expect(() => normaliseBaseUrl('http://corteza.example.com')).toThrow(NOT_HTTPS)
    expect(() => normaliseBaseUrl('ftp://corteza.example.com')).toThrow(NOT_HTTPS)
    expect(() => normaliseBaseUrl('https://')).toThrow(INVALID)
    expect(() => normaliseBaseUrl('not a host')).toThrow(INVALID)
    expect(() => normaliseBaseUrl('https://user:pw@corteza.example.com')).toThrow(USERINFO)
  })
})

describe('CortezaCrmAdapter with a per-customer instance', () => {
  const adapter = new CortezaCrmAdapter(CFG)

  it('declares the base URL as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'baseUrl', required: true, type: 'url' }),
    ])
  })

  it('builds the authorize URL on the customer’s instance', () => {
    const u = new URL(
      adapter.getAuthUrl('st', ['api'], undefined, { baseUrl: 'https://corteza.example.com/' }),
    )
    expect(u.origin).toBe('https://corteza.example.com')
    expect(u.pathname).toBe('/auth/oauth2/authorize')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('refuses to fall back to the public demo instance when no instance is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('exchanges the code on the customer’s instance and stores it in extra', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ access_token: 'tok', refresh_token: 'rt', expires_in: 7200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      baseUrl: 'Corteza.example.com/',
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://corteza.example.com/auth/oauth2/token',
    )
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ baseUrl: 'https://corteza.example.com' })
  })

  it('rejects a plain-http instance before any request is made', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
        baseUrl: 'http://corteza.example.com',
      }),
    ).rejects.toThrow(NOT_HTTPS)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an instance that resolves to a private address before the secret is sent', async () => {
    setDnsResolver(async () => [{ address: '10.0.0.5' }])
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
        baseUrl: 'https://corteza.internal.example',
      }),
    ).rejects.toThrow('SSRF block: corteza.internal.example resolved to 10.0.0.5')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes on the instance stored with the credentials, not on config', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: 'new', expires_in: 7200 }))
    vi.stubGlobal('fetch', fetchMock)
    await new CortezaCrmAdapter({ ...CFG, baseUrl: 'https://other.example.com' }).refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      extra: { baseUrl: 'https://corteza.example.com' },
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://corteza.example.com/auth/oauth2/token',
    )
  })

  it('calls the API on the instance stored with the credentials', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ response: { set: [], filter: {} } }))
    vi.stubGlobal('fetch', fetchMock)
    await adapter
      .listContacts({ accessToken: 'tok', extra: { baseUrl: 'https://corteza.example.com' } }, {})
      .catch(() => undefined) // the response handling is not under test
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0])
    expect(url.origin).toBe('https://corteza.example.com')
    expect(url.pathname.startsWith('/api/compose/')).toBe(true)
  })
})
