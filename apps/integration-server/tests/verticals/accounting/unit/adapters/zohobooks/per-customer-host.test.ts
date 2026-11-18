/**
 * Zoho runs separate data centres, each with its own accounts server
 * (authorize + token) and API host. The adapter hardcoded the US pair
 * (accounts.zoho.com / www.zohoapis.com), so a customer on the EU, India,
 * Australia, Japan, Canada, Saudi Arabia or China data centre could not
 * connect: their code must be exchanged on their own accounts server. It also
 * read the organization id every Books request needs from
 * `credentials.tenantId`, which nothing populated.
 *
 * The callback does not receive Zoho's `accounts-server` redirect parameter,
 * so the data centre is a closed-set `oauthField` chosen before the redirect.
 * After the exchange the adapter reads `GET /organizations` and records the
 * default organization. Both are kept with the credentials, and refresh and
 * the API client use them.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ZohoBooksAdapter } from '../../../../../../src/verticals/accounting/adapters/zohobooks/index'
import { normaliseDataCentre } from '../../../../../../src/verticals/accounting/adapters/zohobooks/constants'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/accounting/zohobooks/callback',
  scopes: ['ZohoBooks.fullaccess.all'],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normaliseDataCentre', () => {
  it.each([
    ['us', 'us'],
    [' EU ', 'eu'],
    ['au', 'au'],
    ['ca', 'ca'],
  ])('%s → %s', (input, want) => {
    expect(normaliseDataCentre(input)).toBe(want)
  })

  it('rejects blanks with a message that names what is missing', () => {
    for (const blank of ['', '  ', undefined]) {
      expect(() => normaliseDataCentre(blank)).toThrow('Zoho data centre is required')
    }
  })

  it('rejects anything outside the closed set of data centres', () => {
    for (const bad of ['accounts.zoho.eu.evil.example', 'evil', 'constructor']) {
      expect(() => normaliseDataCentre(bad)).toThrow('Zoho data centre must be one of')
    }
  })
})

describe('ZohoBooksAdapter with a per-customer data centre', () => {
  const adapter = new ZohoBooksAdapter(CFG)

  it('declares the data centre as a required select oauthField', () => {
    const fields = adapter.oauthFields()
    expect(fields).toEqual([expect.objectContaining({ name: 'dataCentre', type: 'select', required: true })])
    const values = (fields[0].options ?? []).map((o) => o.value)
    expect(values).toEqual(expect.arrayContaining(['us', 'eu', 'in', 'au', 'jp', 'ca', 'sa', 'cn']))
  })

  it('builds the authorize URL on the data centre’s accounts server', () => {
    const eu = new URL(adapter.getAuthUrl('st', undefined, undefined, { dataCentre: 'eu' }))
    expect(eu.origin + eu.pathname).toBe('https://accounts.zoho.eu/oauth/v2/auth')
    expect(eu.searchParams.get('state')).toBe('st')
    const ca = new URL(adapter.getAuthUrl('st', undefined, undefined, { dataCentre: 'ca' }))
    expect(ca.origin).toBe('https://accounts.zohocloud.ca')
  })

  it('refuses to guess a data centre when none was supplied', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow('Zoho data centre is required')
  })

  it('exchanges on that accounts server, discovers the default organization, and stores both', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', refresh_token: 'rt', expires_in: 3600, api_domain: 'https://www.zohoapis.in' },
    })
    const get = vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        organizations: [
          { organization_id: '111', is_default_org: false },
          { organization_id: '222', is_default_org: true },
        ],
      },
    })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { dataCentre: ' IN ' })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe('https://accounts.zoho.in/oauth/v2/token')
    expect(get.mock.calls[0][0]).toBe('https://www.zohoapis.in/books/v3/organizations')
    expect(get.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Zoho-oauthtoken tok' } })
    expect(creds.accessToken).toBe('tok')
    expect(creds.tenantId).toBe('222')
    expect(creds.extra).toEqual({ dataCentre: 'in', organizationId: '222' })
  })

  it('rejects an unsupported data centre before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { dataCentre: 'evil' }),
    ).rejects.toThrow('Zoho data centre must be one of')
    expect(post).not.toHaveBeenCalled()
  })

  it('refreshes on the stored data centre and keeps the organization', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok2', expires_in: 3600 } })
    const creds = await adapter.refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      tenantId: '222',
      extra: { dataCentre: 'au', organizationId: '222' },
    })
    expect(post.mock.calls[0][0]).toBe('https://accounts.zoho.com.au/oauth/v2/token')
    expect(creds.tenantId).toBe('222')
    expect(creds.extra).toEqual({ dataCentre: 'au', organizationId: '222' })
    expect(creds.refreshToken).toBe('rt')
  })

  it('calls the API on the stored data centre with the stored organization', async () => {
    const create = vi.spyOn(axios, 'create')
    await adapter
      .getOrganization({ accessToken: 'tok', tenantId: '222', extra: { dataCentre: 'jp', organizationId: '222' } })
      .catch(() => undefined) // the request itself is not under test
    const cfg = create.mock.calls.at(-1)?.[0] as { baseURL?: string; params?: Record<string, unknown> } | undefined
    expect(cfg?.baseURL).toBe('https://www.zohoapis.jp/books/v3/')
    expect(cfg?.params).toEqual({ organization_id: '222' })
  })
})
