/**
 * Dynamics 365 / Dataverse puts the customer's organisation host inside the
 * authorize request itself (`scope=https://{org}.crm.dynamics.com/.default`),
 * so it cannot be learned from the token response — it has to be known before
 * the redirect. It used to come only from deployment-level config, which the
 * admin UI cannot set, so every Connect Link died on `new URL('')`.
 *
 * The instance URL is now an `oauthField`, restricted to Microsoft's
 * Dataverse regional domains, and travels in `credentials.extra.instanceUrl`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Dynamics365CrmAdapter } from '../../../../../../src/verticals/crm/adapters/dynamics365-crm/index'
import { normaliseInstanceUrl } from '../../../../../../src/verticals/crm/adapters/dynamics365-crm/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/crm/dynamics365-crm/callback',
}

const REQUIRED = 'Dynamics 365 instance URL is required (e.g. https://yourorg.crm.dynamics.com).'
const FOREIGN = 'Dynamics 365 instance URL must be a Dataverse host such as yourorg.crm.dynamics.com.'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normaliseInstanceUrl', () => {
  it.each([
    ['contoso.crm.dynamics.com', 'https://contoso.crm.dynamics.com'],
    ['https://contoso.crm4.dynamics.com/', 'https://contoso.crm4.dynamics.com'],
    ['https://Contoso.CRM11.dynamics.com/main.aspx?appid=1', 'https://contoso.crm11.dynamics.com'],
    ['  org-1.crm.microsoftdynamics.us ', 'https://org-1.crm.microsoftdynamics.us'],
    ['org.crm.dynamics.cn', 'https://org.crm.dynamics.cn'],
  ])('%s → %s', (input, want) => {
    expect(normaliseInstanceUrl(input)).toBe(want)
  })

  it('rejects blanks', () => {
    expect(() => normaliseInstanceUrl('')).toThrow(REQUIRED)
    expect(() => normaliseInstanceUrl('   ')).toThrow(REQUIRED)
    expect(() => normaliseInstanceUrl(undefined)).toThrow(REQUIRED)
  })

  it('rejects hosts outside the Dataverse domains — the token is minted for this audience', () => {
    expect(() => normaliseInstanceUrl('https://evil.example.com')).toThrow(FOREIGN)
    expect(() => normaliseInstanceUrl('contoso.crm.dynamics.com.evil.example')).toThrow(FOREIGN)
    expect(() => normaliseInstanceUrl('crm.dynamics.com')).toThrow(FOREIGN)
    expect(() => normaliseInstanceUrl('http://contoso.crm.dynamics.com')).toThrow(FOREIGN)
    expect(() => normaliseInstanceUrl('a.b.crm.dynamics.com')).toThrow(FOREIGN)
    expect(() => normaliseInstanceUrl('https://user:pw@contoso.crm.dynamics.com')).toThrow(FOREIGN)
  })
})

describe('Dynamics365CrmAdapter with a per-customer instance', () => {
  const adapter = new Dynamics365CrmAdapter(CFG)

  it('declares the instance URL as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'instanceUrl', required: true }),
    ])
  })

  it('puts the customer’s instance in the authorize scope', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, { instanceUrl: 'contoso.crm4.dynamics.com' }),
    )
    expect(u.origin).toBe('https://login.microsoftonline.com')
    expect(u.pathname).toBe('/common/oauth2/v2.0/authorize')
    expect(u.searchParams.get('scope')).toBe(
      'https://contoso.crm4.dynamics.com/.default offline_access',
    )
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('refuses to build an authorize URL with no instance', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('exchanges for a token scoped to that instance and stores it in extra', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ access_token: 'tok', refresh_token: 'rt', expires_in: 3600 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      instanceUrl: 'https://Contoso.crm4.dynamics.com/',
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token')
    expect(new URLSearchParams(String(init.body)).get('scope')).toBe(
      'https://contoso.crm4.dynamics.com/.default offline_access',
    )
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({
      instanceUrl: 'https://contoso.crm4.dynamics.com',
      tenantId: 'common',
    })
  })

  it('rejects a foreign instance before any request is made', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
        instanceUrl: 'https://evil.example.com',
      }),
    ).rejects.toThrow(FOREIGN)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls the API on the instance stored with the credentials', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ value: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await adapter
      .listContacts(
        { accessToken: 'tok', extra: { instanceUrl: 'https://contoso.crm4.dynamics.com' } },
        {},
      )
      .catch(() => undefined) // the response handling is not under test
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0])
    expect(url.origin).toBe('https://contoso.crm4.dynamics.com')
    expect(url.pathname).toBe('/api/data/v9.2/contacts')
  })

  it('refuses to send the bearer token to a stored instance outside Dataverse', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.listContacts(
        { accessToken: 'tok', extra: { instanceUrl: 'https://evil.example.com' } },
        {},
      ),
    ).rejects.toThrow(FOREIGN)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
