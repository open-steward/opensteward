/**
 * Zoho Desk OAuth on the customer's data centre.
 *
 * The adapter used to be labelled oauth2 while `getAuthUrl` and `exchangeCode`
 * only threw, so no customer could connect. It now asks for the data centre
 * before the redirect (`oauthFields`), authorizes and exchanges on that data
 * centre's accounts server, reads the Desk orgId every later call needs, and
 * refreshes on the same server.
 * https://www.zoho.com/accounts/protocol/oauth/web-apps/access-token.html
 * https://desk.zoho.com/DeskAPIDocument (Organizations, Organization Binding)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ZohoDeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/zoho-desk/index'
import {
  normaliseDataCentre,
  DEFAULT_SCOPES,
} from '../../../../../../src/verticals/customer-support/adapters/zoho-desk/constants'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/customer-support/zoho-desk/callback',
}

afterEach(() => {
  vi.restoreAllMocks()
})

function formOf(body: unknown): Record<string, string> {
  expect(body).toBeInstanceOf(URLSearchParams)
  return Object.fromEntries((body as URLSearchParams).entries())
}

describe('normaliseDataCentre', () => {
  it.each([
    ['us', 'us'],
    [' EU ', 'eu'],
    ['sg', 'sg'],
    ['ae', 'ae'],
  ])('%s → %s', (input, want) => {
    expect(normaliseDataCentre(input)).toBe(want)
  })

  it('refuses blanks and anything outside the closed set', () => {
    expect(() => normaliseDataCentre('')).toThrow('Zoho data centre is required')
    expect(() => normaliseDataCentre(undefined)).toThrow('Zoho data centre is required')
    for (const bad of ['cn', 'uk', 'accounts.zoho.eu.evil.example', 'constructor']) {
      expect(() => normaliseDataCentre(bad)).toThrow('Zoho data centre must be one of')
    }
  })
})

describe('ZohoDeskAdapter authorize URL', () => {
  const adapter = new ZohoDeskAdapter(CFG)

  it('declares the data centre as a required select oauthField', () => {
    const fields = adapter.oauthFields()
    expect(fields).toEqual([
      expect.objectContaining({ name: 'dataCentre', type: 'select', required: true }),
    ])
    expect((fields[0]!.options ?? []).map((o) => o.value)).toEqual([
      'us',
      'eu',
      'in',
      'au',
      'jp',
      'ca',
      'sa',
      'sg',
      'ae',
    ])
  })

  it("builds the URL on the data centre's accounts server with the documented params", () => {
    const url = new URL(adapter.getAuthUrl('st', undefined, undefined, { dataCentre: 'eu' }))
    expect(url.origin + url.pathname).toBe('https://accounts.zoho.eu/oauth/v2/auth')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe(CFG.redirectUri)
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('scope')).toBe(DEFAULT_SCOPES.join(','))
    const ca = new URL(adapter.getAuthUrl('st', undefined, undefined, { dataCentre: 'ca' }))
    expect(ca.origin).toBe('https://accounts.zohocloud.ca')
  })

  it('honours overrideScopes', () => {
    const url = new URL(
      adapter.getAuthUrl('st', ['Desk.tickets.READ', 'Desk.basic.READ'], undefined, {
        dataCentre: 'us',
      }),
    )
    expect(url.searchParams.get('scope')).toBe('Desk.tickets.READ,Desk.basic.READ')
  })

  it('refuses to guess a data centre', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow('Zoho data centre is required')
  })
})

describe('ZohoDeskAdapter code exchange', () => {
  const adapter = new ZohoDeskAdapter(CFG)

  it("exchanges on the data centre's token URL with client_secret_post, then records the orgId", async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: {
        access_token: 'tok',
        refresh_token: 'rt',
        expires_in: 3600,
        api_domain: 'https://www.zohoapis.in',
        token_type: 'Bearer',
      },
    })
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { data: [{ id: '3981311', isDefault: 'false' }] } })

    const creds = await adapter.exchangeCodeWithInputs('the-code', CFG.redirectUri, {
      dataCentre: ' IN ',
    })

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe('https://accounts.zoho.in/oauth/v2/token')
    expect(formOf(body)).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: CFG.redirectUri,
      client_id: 'cid',
      client_secret: 'sec',
    })
    const headers = (config?.headers ?? {}) as Record<string, string>
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(headers['Authorization']).toBeUndefined()

    expect(get).toHaveBeenCalledTimes(1)
    const [orgUrl, orgConfig] = get.mock.calls[0]!
    expect(orgUrl).toBe('https://desk.zoho.in/api/v1/accessibleOrganizations')
    const orgHeaders = (orgConfig?.headers ?? {}) as Record<string, string>
    expect(orgHeaders['Authorization']).toBe('Zoho-oauthtoken tok')
    expect(orgHeaders['orgId']).toBeUndefined()

    expect(creds.accessToken).toBe('tok')
    expect(creds.refreshToken).toBe('rt')
    expect(creds.expiresAt).toBeInstanceOf(Date)
    expect(creds.tenantId).toBe('3981311')
    expect(creds.extra).toEqual({ dataCentre: 'in', orgId: '3981311' })
  })

  it('refuses to guess between several organizations, even when one is marked default', async () => {
    // A token is bound to one organization; nothing documented in this
    // response says which, and a wrong orgId fails every call with
    // OAUTH_ORG_MISMATCH.
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok' } })
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        data: [
          { id: '111', isDefault: 'false' },
          { id: '222', isDefault: true },
        ],
      },
    })
    await expect(
      adapter.exchangeCodeWithInputs('c', CFG.redirectUri, { dataCentre: 'us' }),
    ).rejects.toThrow('refusing to guess the orgId')
  })

  it('refuses a token that reaches no organization', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok' } })
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { data: [] } })
    await expect(
      adapter.exchangeCodeWithInputs('c', CFG.redirectUri, { dataCentre: 'us' }),
    ).rejects.toThrow('no Zoho Desk organization')
  })

  it('surfaces a Zoho token error instead of storing an undefined token', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { error: 'invalid_code' } })
    const get = vi.spyOn(axios, 'get')
    await expect(
      adapter.exchangeCodeWithInputs('c', CFG.redirectUri, { dataCentre: 'us' }),
    ).rejects.toThrow('invalid_code')
    expect(get).not.toHaveBeenCalled()
  })

  it('plain exchangeCode (no data centre collected) throws before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(adapter.exchangeCode('c', CFG.redirectUri)).rejects.toThrow(
      'Zoho data centre is required',
    )
    expect(post).not.toHaveBeenCalled()
  })
})

describe('ZohoDeskAdapter refresh', () => {
  const adapter = new ZohoDeskAdapter(CFG)
  const stored = {
    accessToken: 'old',
    refreshToken: 'rt',
    tenantId: '3981311',
    extra: { dataCentre: 'au', orgId: '3981311' },
  }

  it("refreshes on the connection's data centre and keeps the refresh token, tenant and extra", async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: {
        access_token: 'new',
        api_domain: 'https://www.zohoapis.com.au',
        token_type: 'Bearer',
        expires_in: 3600,
      },
    })
    const creds = await adapter.refreshCredentials(stored)
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe('https://accounts.zoho.com.au/oauth/v2/token')
    expect(formOf(body)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'rt',
      client_id: 'cid',
      client_secret: 'sec',
    })
    expect(((config?.headers ?? {}) as Record<string, string>)['Authorization']).toBeUndefined()
    expect(creds.accessToken).toBe('new')
    expect(creds.refreshToken).toBe('rt')
    expect(creds.expiresAt).toBeInstanceOf(Date)
    expect(creds.tenantId).toBe('3981311')
    expect(creds.extra).toEqual({ dataCentre: 'au', orgId: '3981311' })
    expect(creds.webhookSecret).toBeUndefined()
  })

  it('keeps the stored webhookSecret (the Zoho webhookId the JWT aud is pinned to)', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'new', token_type: 'Bearer', expires_in: 3600 },
    })
    const creds = await adapter.refreshCredentials({
      ...stored,
      webhookSecret: '116554000001013027',
    })
    expect(creds.webhookSecret).toBe('116554000001013027')
  })

  it('refuses without a refresh token or a recorded data centre, sending nothing', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(adapter.refreshCredentials({ accessToken: 'x' })).rejects.toThrow(
      'No refresh token',
    )
    await expect(
      adapter.refreshCredentials({ accessToken: 'x', refreshToken: 'rt', extra: {} }),
    ).rejects.toThrow('Zoho data centre is required')
    expect(post).not.toHaveBeenCalled()
  })
})
