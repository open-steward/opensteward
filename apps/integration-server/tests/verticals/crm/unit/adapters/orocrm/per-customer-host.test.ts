/**
 * OroCRM is self-hosted: authorize, token and API all live on the customer's
 * own installation. The adapter read that URL from deployment-level config —
 * which the admin UI cannot set — defaulting to `''`, so every Connect Link
 * died on `new URL('/oauth2-token/authorize')`.
 *
 * The base URL is now an `oauthField`. Because it is free-form, it must be
 * https and must resolve to a public address before any request carrying the
 * client secret or a token is made to it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { OrocrmAdapter } from '../../../../../../src/verticals/crm/adapters/orocrm/index'
import { normaliseBaseUrl } from '../../../../../../src/verticals/crm/adapters/orocrm/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/crm/orocrm/callback',
}

const REQUIRED = 'OroCRM base URL is required (e.g. https://crm.example.com).'
const NOT_HTTPS = 'OroCRM base URL must use https://.'
const INVALID = 'OroCRM base URL must be a valid https:// URL.'
const USERINFO = 'OroCRM base URL must not contain a username or password.'

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
    ['https://crm.example.com', 'https://crm.example.com'],
    ['https://CRM.example.com/', 'https://crm.example.com'],
    ['crm.example.com', 'https://crm.example.com'],
    ['https://example.com/oro/', 'https://example.com/oro'],
    ['https://crm.example.com/?x=1#frag', 'https://crm.example.com'],
  ])('%s → %s', (input, want) => {
    expect(normaliseBaseUrl(input)).toBe(want)
  })

  it('rejects blanks', () => {
    expect(() => normaliseBaseUrl('')).toThrow(REQUIRED)
    expect(() => normaliseBaseUrl(undefined)).toThrow(REQUIRED)
  })

  it('rejects anything but a plain https URL', () => {
    expect(() => normaliseBaseUrl('http://crm.example.com')).toThrow(NOT_HTTPS)
    expect(() => normaliseBaseUrl('https://')).toThrow(INVALID)
    expect(() => normaliseBaseUrl('https://user:pw@crm.example.com')).toThrow(USERINFO)
  })
})

describe('OrocrmAdapter with a per-customer installation', () => {
  const adapter = new OrocrmAdapter(CFG)

  it('declares the base URL as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'baseUrl', required: true, type: 'url' }),
    ])
  })

  it('builds the authorize URL on the customer’s installation', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, { baseUrl: 'https://crm.example.com/' }),
    )
    expect(u.origin).toBe('https://crm.example.com')
    expect(u.pathname).toBe('/oauth2-token/authorize')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('refuses to build an authorize URL with no installation known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('exchanges the code on the customer’s installation and stores the normalised URL in extra', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ access_token: 'tok', refresh_token: 'rt', expires_in: 3600 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      baseUrl: 'https://CRM.example.com/',
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://crm.example.com/oauth2-token',
    )
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toMatchObject({ baseUrl: 'https://crm.example.com' })
  })

  it('rejects a plain-http installation before any request is made', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { baseUrl: 'http://crm.example.com' }),
    ).rejects.toThrow(NOT_HTTPS)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an installation that resolves to a private address before the secret is sent', async () => {
    setDnsResolver(async () => [{ address: '192.168.1.20' }])
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { baseUrl: 'https://oro.lan.example' }),
    ).rejects.toThrow('SSRF block: oro.lan.example resolved to 192.168.1.20')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes on the installation stored with the credentials, not on config', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: 'new', expires_in: 3600 }))
    vi.stubGlobal('fetch', fetchMock)
    await new OrocrmAdapter({ ...CFG, baseUrl: 'https://other.example.com' }).refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      extra: { baseUrl: 'https://crm.example.com' },
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://crm.example.com/oauth2-token',
    )
  })

  it('calls the API on the installation stored with the credentials', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await new OrocrmAdapter({ ...CFG, baseUrl: 'https://other.example.com' })
      .listContacts({ accessToken: 'tok', extra: { baseUrl: 'https://crm.example.com' } }, {})
      .catch(() => undefined) // the response handling is not under test
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0]
    expect(url.startsWith('https://crm.example.com/')).toBe(true)
    expect(url).toContain('/contacts')
  })
})
