/**
 * Creatio runs per customer (`*.creatio.com` cloud sites or on-site
 * installs): authorize, token and OData API live on the customer's own
 * instance. The adapter read that URL from deployment-level config — which the
 * admin UI cannot set — and otherwise used the placeholder
 * `https://yoursite.creatio.com`, so every Connect Link went to a host that is
 * not the customer's. It also redirected to `/0/oauth/imessage/code`, which is
 * not Creatio's documented authorize endpoint (`/0/connect/authorize`).
 *
 * The instance URL is now an `oauthField`. Because it is free-form, it must be
 * https and must resolve to a public address before any request carrying the
 * client secret or a token is made to it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { CreatioAdapter, normaliseInstanceUrl } from '../../../../../../src/verticals/crm/adapters/creatio/index'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/crm/creatio/callback',
}

const REQUIRED = 'Creatio instance URL is required (e.g. https://yoursite.creatio.com).'
const NOT_HTTPS = 'Creatio instance URL must use https://.'
const INVALID = 'Creatio instance URL must be a valid https:// URL.'
const USERINFO = 'Creatio instance URL must not contain a username or password.'

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

describe('normaliseInstanceUrl', () => {
  it.each([
    ['https://acme.creatio.com', 'https://acme.creatio.com'],
    ['https://ACME.creatio.com/', 'https://acme.creatio.com'],
    ['acme.creatio.com', 'https://acme.creatio.com'],
    ['https://acme.creatio.com/0/Shell/#Section/Contact_ListPage', 'https://acme.creatio.com'],
    ['https://crm.example.com/creatio/0/', 'https://crm.example.com/creatio'],
  ])('%s → %s', (input, want) => {
    expect(normaliseInstanceUrl(input)).toBe(want)
  })

  it('rejects blanks', () => {
    expect(() => normaliseInstanceUrl('')).toThrow(REQUIRED)
    expect(() => normaliseInstanceUrl(undefined)).toThrow(REQUIRED)
  })

  it('rejects anything but a plain https URL', () => {
    expect(() => normaliseInstanceUrl('http://acme.creatio.com')).toThrow(NOT_HTTPS)
    expect(() => normaliseInstanceUrl('https://')).toThrow(INVALID)
    expect(() => normaliseInstanceUrl('https://user:pw@acme.creatio.com')).toThrow(USERINFO)
  })
})

describe('CreatioAdapter with a per-customer instance', () => {
  const adapter = new CreatioAdapter(CFG)

  it('declares the instance URL as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'instanceUrl', required: true, type: 'url' }),
    ])
  })

  it('builds the authorize URL on the customer’s instance, at the documented endpoint', () => {
    const u = new URL(
      adapter.getAuthUrl('st', ['offline_access'], undefined, { instanceUrl: 'acme.creatio.com' }),
    )
    expect(u.origin).toBe('https://acme.creatio.com')
    expect(u.pathname).toBe('/0/connect/authorize')
    expect(u.searchParams.get('state')).toBe('st')
    expect(u.searchParams.get('scope')).toBe('offline_access')
  })

  it('refuses to build an authorize URL on a placeholder host', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('exchanges the code on the customer’s instance and stores the normalised URL in extra', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ access_token: 'tok', refresh_token: 'rt', expires_in: 3600 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      instanceUrl: 'https://ACME.creatio.com/',
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://acme.creatio.com/0/connect/token',
    )
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ instanceUrl: 'https://acme.creatio.com' })
  })

  it('rejects a plain-http instance before any request is made', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { instanceUrl: 'http://acme.creatio.com' }),
    ).rejects.toThrow(NOT_HTTPS)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an instance that resolves to a private address before the secret is sent', async () => {
    setDnsResolver(async () => [{ address: '10.1.2.3' }])
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
        instanceUrl: 'https://creatio.corp.example',
      }),
    ).rejects.toThrow('SSRF block: creatio.corp.example resolved to 10.1.2.3')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes on the instance stored with the credentials', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: 'new', expires_in: 3600 }))
    vi.stubGlobal('fetch', fetchMock)
    await new CreatioAdapter({ ...CFG, instanceUrl: 'https://other.creatio.com' }).refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      extra: { instanceUrl: 'https://acme.creatio.com' },
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://acme.creatio.com/0/connect/token',
    )
  })

  it('calls the API on the instance stored with the credentials', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ value: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await adapter
      .listContacts({ accessToken: 'tok', extra: { instanceUrl: 'https://acme.creatio.com' } }, {})
      .catch(() => undefined) // the response handling is not under test
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0]
    expect(url.startsWith('https://acme.creatio.com/0/odata/')).toBe(true)
  })

  it('refuses to call the API when no instance is stored rather than hitting a placeholder', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ value: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(adapter.listContacts({ accessToken: 'tok' }, {})).rejects.toThrow(REQUIRED)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
