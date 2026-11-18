/**
 * SAP Sales Cloud Version 2 lives on a per-customer tenant host
 * (`myXXXXXX.crm.cloud.sap`). Its API authentication is a technical user:
 * HTTP Basic to `/sap/c4c/api/v1/iam-service/token` returns a short-lived
 * bearer token (or OAuth2 SAML bearer, for user propagation from BTP). There is
 * no browser authorization-code endpoint. The adapter nonetheless redirected
 * to an ABAP-style `/sap/bc/sec/oauth2/authorize` on the placeholder
 * `https://tenant.crm.cloud.sap`, because the real tenant could only come from
 * deployment-level config the admin UI cannot set.
 *
 * The adapter now collects the tenant, username and password through
 * `credentialFields`, mints the token on the customer's tenant, and stores the
 * normalised tenant URL in `credentials.extra`. The tenant is restricted to
 * `*.crm.cloud.sap`, because the password is sent to it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { SapSalesCloudAdapter } from '../../../../../../src/verticals/crm/adapters/sap-sales-cloud/index'
import { normaliseTenantUrl } from '../../../../../../src/verticals/crm/adapters/sap-sales-cloud/auth'

const REQUIRED = 'SAP Sales Cloud tenant is required (e.g. my123456.crm.cloud.sap).'
const FOREIGN = 'SAP Sales Cloud tenant must be a *.crm.cloud.sap host.'
const NO_LOGIN = 'SAP Sales Cloud username and password are required.'
const NO_TOKEN = 'SAP Sales Cloud token response did not include an access_token.'
const NO_OAUTH =
  'SAP Sales Cloud Version 2 has no OAuth authorization-code endpoint; connect with a technical user instead.'

const FIELDS = { tenantUrl: 'My123456.crm.cloud.sap', username: 'TECH_USER', password: 's3cret' }

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normaliseTenantUrl', () => {
  it.each([
    ['my123456', 'https://my123456.crm.cloud.sap'],
    ['my123456.crm.cloud.sap', 'https://my123456.crm.cloud.sap'],
    ['https://My123456.CRM.cloud.sap/', 'https://my123456.crm.cloud.sap'],
    ['https://my123456.crm.cloud.sap/sap/c4c/api/v1/', 'https://my123456.crm.cloud.sap'],
    ['my1000210.de1.demo.crm.cloud.sap', 'https://my1000210.de1.demo.crm.cloud.sap'],
  ])('%s → %s', (input, want) => {
    expect(normaliseTenantUrl(input)).toBe(want)
  })

  it('rejects blanks', () => {
    expect(() => normaliseTenantUrl('')).toThrow(REQUIRED)
    expect(() => normaliseTenantUrl('  ')).toThrow(REQUIRED)
    expect(() => normaliseTenantUrl(undefined)).toThrow(REQUIRED)
  })

  it('rejects hosts outside crm.cloud.sap — the password is sent there', () => {
    expect(() => normaliseTenantUrl('evil.example.com')).toThrow(FOREIGN)
    expect(() => normaliseTenantUrl('my123456.crm.cloud.sap.evil.example')).toThrow(FOREIGN)
    expect(() => normaliseTenantUrl('http://my123456.crm.cloud.sap')).toThrow(FOREIGN)
    expect(() => normaliseTenantUrl('crm.cloud.sap')).toThrow(FOREIGN)
    expect(() => normaliseTenantUrl('my123456.crm.ondemand.com')).toThrow(FOREIGN)
  })
})

describe('SapSalesCloudAdapter connecting with a technical user', () => {
  const adapter = new SapSalesCloudAdapter({})

  it('declares tenant, username and password as required credentialFields', () => {
    expect(adapter.credentialFields()).toEqual([
      expect.objectContaining({ name: 'tenantUrl', required: true }),
      expect.objectContaining({ name: 'username', required: true }),
      expect.objectContaining({ name: 'password', required: true, type: 'password' }),
    ])
  })

  it('says plainly that there is no authorization-code flow instead of redirecting to a placeholder', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(NO_OAUTH)
  })

  it('mints a token on the customer’s tenant and stores the tenant in extra', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ value: { access_token: 'tok', expires_in: 3600 } }))
    vi.stubGlobal('fetch', fetchMock)
    const before = Date.now()
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://my123456.crm.cloud.sap/sap/c4c/api/v1/iam-service/token')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${Buffer.from('TECH_USER:s3cret').toString('base64')}`,
    )
    expect(url).not.toContain('s3cret')
    expect(creds.accessToken).toBe('tok')
    expect(creds.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000)
    expect(creds.extra).toMatchObject({ tenantUrl: 'https://my123456.crm.cloud.sap' })
  })

  it('accepts a token at the top level of the response too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ access_token: 'flat' })))
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(creds.accessToken).toBe('flat')
  })

  it('fails with a specific message when the response carries no token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ value: {} })))
    await expect(adapter.exchangeCredentials(FIELDS)).rejects.toThrow(NO_TOKEN)
  })

  it('rejects a foreign tenant before any request is made', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCredentials({ ...FIELDS, tenantUrl: 'my123456.crm.cloud.sap.evil.example' }),
    ).rejects.toThrow(FOREIGN)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a blank tenant or missing password before any request is made', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(adapter.exchangeCredentials({ ...FIELDS, tenantUrl: '' })).rejects.toThrow(REQUIRED)
    await expect(adapter.exchangeCredentials({ ...FIELDS, password: '' })).rejects.toThrow(NO_LOGIN)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('re-mints an expired token on the stored tenant', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: 'new', expires_in: 3600 }))
    vi.stubGlobal('fetch', fetchMock)
    const next = await adapter.refreshCredentials({
      accessToken: 'old',
      expiresAt: new Date(0),
      extra: { tenantUrl: 'https://my123456.crm.cloud.sap', username: 'TECH_USER', password: 's3cret' },
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://my123456.crm.cloud.sap/sap/c4c/api/v1/iam-service/token',
    )
    expect(next.accessToken).toBe('new')
    expect(next.extra).toMatchObject({ tenantUrl: 'https://my123456.crm.cloud.sap' })
  })

  it('calls the API on the tenant stored with the credentials', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ value: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await adapter
      .listContacts({ accessToken: 'tok', extra: { tenantUrl: 'https://my123456.crm.cloud.sap' } }, {})
      .catch(() => undefined) // the response handling is not under test
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0]
    expect(url.startsWith('https://my123456.crm.cloud.sap/sap/c4c/api/v1/')).toBe(true)
  })

  it('refuses to send the bearer token to a stored tenant outside crm.cloud.sap', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ value: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.listContacts({ accessToken: 'tok', extra: { tenantUrl: 'https://tenant.evil.example' } }, {}),
    ).rejects.toThrow(FOREIGN)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
