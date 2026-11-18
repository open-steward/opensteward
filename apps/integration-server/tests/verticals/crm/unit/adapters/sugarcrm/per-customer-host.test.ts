/**
 * SugarCRM's REST token endpoint (`POST {instance}/rest/v11_1/oauth2/token`)
 * accepts only the `password` and `refresh_token` grants — there is no
 * authorization-code redirect. The adapter nonetheless built one against a
 * deployment-level instance URL the admin UI cannot set (defaulting to the
 * placeholder `yourcompany.sugarondemand.com`) and pointed it at a legacy
 * OAuth 1 page, so no customer could ever connect.
 *
 * The adapter now collects the instance URL, username and password through
 * `credentialFields`, runs the password grant on the customer's instance, and
 * stores the normalised instance URL in `credentials.extra`. The URL is
 * free-form, so it must be https and must resolve to a public address before
 * the password is sent to it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { SugarCrmAdapter } from '../../../../../../src/verticals/crm/adapters/sugarcrm/index'
import { normaliseInstanceUrl } from '../../../../../../src/verticals/crm/adapters/sugarcrm/auth'

const REQUIRED = 'SugarCRM instance URL is required (e.g. https://yourcompany.sugarondemand.com).'
const NOT_HTTPS = 'SugarCRM instance URL must use https://.'
const INVALID = 'SugarCRM instance URL must be a valid https:// URL.'
const USERINFO = 'SugarCRM instance URL must not contain a username or password.'
const NO_LOGIN = 'SugarCRM username and password are required.'
const NO_OAUTH =
  'SugarCRM does not support the OAuth authorization-code flow; connect with a username and password instead.'

const FIELDS = {
  instanceUrl: 'https://Acme.sugarondemand.com/',
  username: 'jim',
  password: 'hunter2',
}

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
    ['https://acme.sugarondemand.com', 'https://acme.sugarondemand.com'],
    ['https://ACME.sugarondemand.com/', 'https://acme.sugarondemand.com'],
    ['acme.sugarondemand.com', 'https://acme.sugarondemand.com'],
    ['https://acme.sugarondemand.com/index.php?module=Home', 'https://acme.sugarondemand.com'],
    ['https://crm.example.com/sugar/rest/v11_1/Contacts', 'https://crm.example.com/sugar'],
    ['https://crm.example.com/sugar/#Contacts', 'https://crm.example.com/sugar'],
  ])('%s → %s', (input, want) => {
    expect(normaliseInstanceUrl(input)).toBe(want)
  })

  it('rejects blanks', () => {
    expect(() => normaliseInstanceUrl('')).toThrow(REQUIRED)
    expect(() => normaliseInstanceUrl(undefined)).toThrow(REQUIRED)
  })

  it('rejects anything but a plain https URL', () => {
    expect(() => normaliseInstanceUrl('http://acme.sugarondemand.com')).toThrow(NOT_HTTPS)
    expect(() => normaliseInstanceUrl('https://')).toThrow(INVALID)
    expect(() => normaliseInstanceUrl('https://u:p@acme.sugarondemand.com')).toThrow(USERINFO)
  })
})

describe('SugarCrmAdapter connecting with a password grant', () => {
  const adapter = new SugarCrmAdapter({})

  it('declares instance URL, username and password as required credentialFields', () => {
    const fields = adapter.credentialFields()
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'instanceUrl', required: true, type: 'url' }),
        expect.objectContaining({ name: 'username', required: true }),
        expect.objectContaining({ name: 'password', required: true, type: 'password' }),
      ]),
    )
  })

  it('says plainly that there is no authorization-code flow instead of redirecting to a placeholder', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(NO_OAUTH)
  })

  it('runs the password grant on the customer’s instance and stores it in extra', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ access_token: 'tok', refresh_token: 'rt', expires_in: 3600 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://acme.sugarondemand.com/rest/v11_1/oauth2/token')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      grant_type: 'password',
      client_id: 'sugar',
      client_secret: '',
      username: 'jim',
      password: 'hunter2',
      platform: 'base',
    })
    expect(creds.accessToken).toBe('tok')
    expect(creds.refreshToken).toBe('rt')
    expect(creds.extra).toEqual({
      instanceUrl: 'https://acme.sugarondemand.com',
      clientId: 'sugar',
      clientSecret: '',
      platform: 'base',
    })
    expect(JSON.stringify(creds.extra)).not.toContain('hunter2')
  })

  it('rejects a blank instance URL before any request is made', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(adapter.exchangeCredentials({ ...FIELDS, instanceUrl: ' ' })).rejects.toThrow(REQUIRED)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a missing password before any request is made', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(adapter.exchangeCredentials({ ...FIELDS, password: '' })).rejects.toThrow(NO_LOGIN)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a plain-http instance before the password is sent', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCredentials({ ...FIELDS, instanceUrl: 'http://acme.sugarondemand.com' }),
    ).rejects.toThrow(NOT_HTTPS)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an instance that resolves to a private address before the password is sent', async () => {
    setDnsResolver(async () => [{ address: '10.9.9.9' }])
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCredentials({ ...FIELDS, instanceUrl: 'https://sugar.corp.example' }),
    ).rejects.toThrow('SSRF block: sugar.corp.example resolved to 10.9.9.9')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes on the instance stored with the credentials, using the stored client', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: 'new', expires_in: 3600 }))
    vi.stubGlobal('fetch', fetchMock)
    const next = await adapter.refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      extra: {
        instanceUrl: 'https://acme.sugarondemand.com',
        clientId: 'sugar',
        clientSecret: '',
        platform: 'base',
      },
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://acme.sugarondemand.com/rest/v11_1/oauth2/token')
    expect(JSON.parse(String(init.body))).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'rt',
      client_id: 'sugar',
    })
    expect(next.accessToken).toBe('new')
  })

  it('calls the API on the instance stored with the credentials', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ records: [], next_offset: -1 }))
    vi.stubGlobal('fetch', fetchMock)
    await adapter
      .listContacts({ accessToken: 'tok', extra: { instanceUrl: 'https://acme.sugarondemand.com' } }, {})
      .catch(() => undefined) // the response handling is not under test
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0]
    expect(url.startsWith('https://acme.sugarondemand.com/rest/v11_1/Contacts')).toBe(true)
  })
})
