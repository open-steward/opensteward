/**
 * 1CRM runs per customer (1crmcloud.com or self-hosted): authorize, token and
 * API live under the customer's own `api.php`. The adapter read that URL from
 * deployment-level config — which the admin UI cannot set — and otherwise
 * fell back to 1CRM's public demo, so a customer's Connect Link went to
 * `demo.1crmcloud.com` and this deployment's client secret was POSTed there.
 *
 * The URL is now an `oauthField`. Because it is free-form, it must be https
 * and must resolve to a public address before any request carrying the client
 * secret or a token is made to it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { OneCrmAdapter } from '../../../../../../src/verticals/crm/adapters/1crm/index'
import { normaliseBaseUrl } from '../../../../../../src/verticals/crm/adapters/1crm/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/crm/1crm/callback',
}

const REQUIRED = '1CRM URL is required (e.g. https://yourcompany.1crmcloud.com).'
const NOT_HTTPS = '1CRM URL must use https://.'
const INVALID = '1CRM URL must be a valid https:// URL.'
const USERINFO = '1CRM URL must not contain a username or password.'

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
    ['https://acme.1crmcloud.com', 'https://acme.1crmcloud.com'],
    ['https://ACME.1crmcloud.com/', 'https://acme.1crmcloud.com'],
    ['acme.1crmcloud.com', 'https://acme.1crmcloud.com'],
    ['https://portal.example.com/1crm/', 'https://portal.example.com/1crm'],
    ['https://portal.example.com/1crm/api.php/data/Contact', 'https://portal.example.com/1crm'],
    ['https://acme.1crmcloud.com/api.php', 'https://acme.1crmcloud.com'],
  ])('%s → %s', (input, want) => {
    expect(normaliseBaseUrl(input)).toBe(want)
  })

  it('rejects blanks', () => {
    expect(() => normaliseBaseUrl('')).toThrow(REQUIRED)
    expect(() => normaliseBaseUrl(undefined)).toThrow(REQUIRED)
  })

  it('rejects anything but a plain https URL', () => {
    expect(() => normaliseBaseUrl('http://acme.1crmcloud.com')).toThrow(NOT_HTTPS)
    expect(() => normaliseBaseUrl('https://')).toThrow(INVALID)
    expect(() => normaliseBaseUrl('https://user:pw@acme.1crmcloud.com')).toThrow(USERINFO)
  })
})

describe('OneCrmAdapter with a per-customer instance', () => {
  const adapter = new OneCrmAdapter(CFG)

  it('declares the URL as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'baseUrl', required: true, type: 'url' }),
    ])
  })

  it('builds the authorize URL on the customer’s instance', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, { baseUrl: 'https://acme.1crmcloud.com/' }),
    )
    expect(u.origin).toBe('https://acme.1crmcloud.com')
    expect(u.pathname).toBe('/api.php/auth/user/authorize')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('refuses to fall back to the public demo when no instance is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('exchanges the code on the customer’s instance and stores the normalised URL in extra', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ access_token: 'tok', refresh_token: 'rt', expires_in: 3600 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      baseUrl: 'https://Portal.example.com/1crm/',
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://portal.example.com/1crm/api.php/auth/user/access_token',
    )
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ baseUrl: 'https://portal.example.com/1crm' })
  })

  it('rejects a plain-http instance before any request is made', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { baseUrl: 'http://acme.1crmcloud.com' }),
    ).rejects.toThrow(NOT_HTTPS)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an instance that resolves to a private address before the secret is sent', async () => {
    setDnsResolver(async () => [{ address: '172.16.4.4' }])
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { baseUrl: 'https://crm.intra.example' }),
    ).rejects.toThrow('SSRF block: crm.intra.example resolved to 172.16.4.4')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes on the instance stored with the credentials, not on config', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: 'new', expires_in: 3600 }))
    vi.stubGlobal('fetch', fetchMock)
    await new OneCrmAdapter({ ...CFG, baseUrl: 'https://other.example.com' }).refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      extra: { baseUrl: 'https://acme.1crmcloud.com' },
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://acme.1crmcloud.com/api.php/auth/user/access_token',
    )
  })

  it('calls the API on the instance stored with the credentials, not on config', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ records: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await new OneCrmAdapter({ ...CFG, baseUrl: 'https://other.example.com' })
      .listContacts({ accessToken: 'tok', extra: { baseUrl: 'https://acme.1crmcloud.com' } }, {})
      .catch(() => undefined) // the response handling is not under test
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0]
    expect(url.startsWith('https://acme.1crmcloud.com/api.php/data/Contact')).toBe(true)
  })
})
