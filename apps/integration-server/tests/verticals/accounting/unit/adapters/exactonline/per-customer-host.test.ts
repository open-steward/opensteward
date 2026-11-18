/**
 * Exact Online runs a separate site per country (start.exactonline.nl, .be,
 * .de, .co.uk, .com, …); authorize, token and REST endpoints live on the
 * customer's country site, and an account on one site cannot sign in on
 * another. The adapter used to take `region` only from deployment config —
 * which the admin UI cannot set — so every customer was sent to the Dutch
 * site. It also read the division (part of every REST path) from
 * `credentials.tenantId`, which nothing populated.
 *
 * The region is now an `oauthField` select; the division is discovered from
 * `current/Me` right after the token exchange. Both are kept with the
 * credentials, and the API client builds its base URL from them.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ExactOnlineAdapter } from '../../../../../../src/verticals/accounting/adapters/exactonline/index'
import { normaliseRegion } from '../../../../../../src/verticals/accounting/adapters/exactonline/constants'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/accounting/exactonline/callback',
  scopes: [],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normaliseRegion', () => {
  it.each([
    ['nl', 'nl'],
    [' UK ', 'uk'],
    ['us', 'us'],
  ])('%s → %s', (input, want) => {
    expect(normaliseRegion(input)).toBe(want)
  })

  it('rejects blanks with a message that names what is missing', () => {
    for (const blank of ['', '   ', undefined]) {
      expect(() => normaliseRegion(blank)).toThrow('Exact Online region is required')
    }
  })

  it('rejects anything outside the closed set of country sites', () => {
    for (const bad of ['evil.example', 'start.exactonline.nl.evil.example', 'xx']) {
      expect(() => normaliseRegion(bad)).toThrow('Exact Online region must be one of')
    }
  })
})

describe('ExactOnlineAdapter with a per-customer country site', () => {
  const adapter = new ExactOnlineAdapter(CFG)

  it('declares the region as a required select oauthField', () => {
    const fields = adapter.oauthFields()
    expect(fields).toEqual([expect.objectContaining({ name: 'region', type: 'select', required: true })])
    const values = (fields[0].options ?? []).map((o) => o.value)
    expect(values).toEqual(expect.arrayContaining(['nl', 'be', 'de', 'uk', 'us']))
  })

  it('builds the authorize URL on the customer’s country site', () => {
    const u = new URL(adapter.getAuthUrl('st', undefined, undefined, { region: 'uk' }))
    expect(u.origin + u.pathname).toBe('https://start.exactonline.co.uk/api/oauth2/auth')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('refuses to guess a country site when none was supplied', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow('Exact Online region is required')
    expect(() => adapter.getAuthUrl('st', undefined, undefined, { region: 'evil.example' })).toThrow(
      'Exact Online region must be one of',
    )
  })

  it('exchanges on that site, discovers the division, and stores both', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', refresh_token: 'rt', expires_in: 600 },
    })
    const get = vi.spyOn(axios, 'get').mockResolvedValue({
      data: { d: { results: [{ CurrentDivision: 7095 }] } },
    })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { region: ' US ' })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe('https://start.exactonline.com/api/oauth2/token')
    expect(get.mock.calls[0][0]).toBe('https://start.exactonline.com/api/v1/current/Me')
    expect(get.mock.calls[0][1]).toMatchObject({
      params: { $select: 'CurrentDivision' },
      headers: { Authorization: 'Bearer tok' },
    })
    expect(creds.accessToken).toBe('tok')
    expect(creds.tenantId).toBe('7095')
    expect(creds.extra).toEqual({ region: 'us', division: '7095' })
  })

  it('rejects an unsupported region before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { region: 'evil.example' }),
    ).rejects.toThrow('Exact Online region must be one of')
    expect(post).not.toHaveBeenCalled()
  })

  it('refreshes on the stored country site and keeps region + division', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok2', expires_in: 600 } })
    const creds = await adapter.refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      tenantId: '7095',
      extra: { region: 'be', division: '7095' },
    })
    expect(post.mock.calls[0][0]).toBe('https://start.exactonline.be/api/oauth2/token')
    expect(creds.tenantId).toBe('7095')
    expect(creds.extra).toEqual({ region: 'be', division: '7095' })
    expect(creds.refreshToken).toBe('rt')
  })

  it('calls the API on the stored country site and division', async () => {
    const create = vi.spyOn(axios, 'create')
    await adapter
      .getOrganization({ accessToken: 'tok', tenantId: '7095', extra: { region: 'de', division: '7095' } })
      .catch(() => undefined) // the request itself is not under test
    const baseURL = (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
    expect(baseURL).toBe('https://start.exactonline.de/api/v1/7095/')
  })

  it('refuses to call the API without a division instead of requesting /v1//', async () => {
    const create = vi.spyOn(axios, 'create')
    await expect(
      adapter.getOrganization({ accessToken: 'tok', extra: { region: 'nl' } }),
    ).rejects.toThrow('Exact Online division is missing from the connection')
    expect(create).not.toHaveBeenCalled()
  })
})
