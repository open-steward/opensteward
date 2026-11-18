/**
 * Ironclad is region-hosted (na1, eu1, demo): the authorize endpoint, the
 * token endpoint and the REST API all live on `{region}.ironcladapp.com`, and
 * the region is the customer's. It used to come only from deployment config —
 * which the admin UI cannot write — so every EU and demo customer was sent to
 * na1. The region is now an `oauthField`, validated to stay on
 * ironcladapp.com, and carried on `credentials.extra`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { IroncladAdapter } from '../../../../../../src/verticals/docsign/adapters/ironclad/index'
import { normaliseIroncladRegion } from '../../../../../../src/verticals/docsign/adapters/ironclad/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/docsign/ironclad/callback',
}
const TOKEN = { access_token: 'tok', refresh_token: 'ref', token_type: 'Bearer', expires_in: 21600 }
const REQUIRED = 'Ironclad region is required (na1, eu1 or demo).'
const FOREIGN = 'Ironclad region must be an ironcladapp.com subdomain such as na1, eu1 or demo.'

function fakeHttp() {
  const http = {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
  }
  const create = vi
    .spyOn(axios, 'create')
    .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
  return () => (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normaliseIroncladRegion', () => {
  it.each([
    ['na1', 'na1'],
    [' EU1 ', 'eu1'],
    ['eu1.ironcladapp.com', 'eu1'],
    ['https://demo.ironcladapp.com/public/api/v1', 'demo'],
    ['ironcladapp.com', 'na1'],
  ])('%s → %s', (input, want) => {
    expect(normaliseIroncladRegion(input)).toBe(want)
  })

  it('rejects blanks with a specific message', () => {
    expect(() => normaliseIroncladRegion('')).toThrow(REQUIRED)
    expect(() => normaliseIroncladRegion(undefined)).toThrow(REQUIRED)
  })

  it('rejects anything outside ironcladapp.com — the token exchange carries the client secret', () => {
    expect(() => normaliseIroncladRegion('evil.example')).toThrow(FOREIGN)
    expect(() => normaliseIroncladRegion('eu1.ironcladapp.com.evil.example')).toThrow(FOREIGN)
    expect(() => normaliseIroncladRegion('a.b.ironcladapp.com')).toThrow(FOREIGN)
  })
})

describe('IroncladAdapter with a per-customer region', () => {
  const adapter = new IroncladAdapter(CFG)

  it('declares the region as a required oauthField', () => {
    const fields = adapter.oauthFields()
    expect(fields).toEqual([expect.objectContaining({ name: 'region', required: true, type: 'select' })])
    expect(fields[0].options?.map((o) => o.value)).toEqual(['na1', 'eu1', 'demo'])
  })

  it('builds the authorize URL on the customer region', () => {
    const u = new URL(adapter.getAuthUrl('st', undefined, undefined, { region: 'eu1' }))
    expect(u.host).toBe('eu1.ironcladapp.com')
    expect(u.pathname).toBe('/oauth/authorize')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('refuses to guess a region when none is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('refuses a foreign host at authorize time', () => {
    expect(() => adapter.getAuthUrl('st', undefined, undefined, { region: 'evil.example' })).toThrow(FOREIGN)
  })

  it('exchanges on the customer region and stores it in extra', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      region: 'https://EU1.ironcladapp.com/',
    })
    expect(post.mock.calls[0][0]).toBe('https://eu1.ironcladapp.com/oauth/token')
    expect(creds.extra).toEqual({ region: 'eu1' })
  })

  it('refuses a foreign host before any request', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { region: 'eu1.ironcladapp.com.evil.example' }),
    ).rejects.toThrow(FOREIGN)
    expect(post).not.toHaveBeenCalled()
  })

  it('calls the API on the region stored with the credentials', async () => {
    const baseURL = fakeHttp()
    await adapter.listEnvelopes({ accessToken: 'tok', extra: { region: 'eu1' } }, {})
    expect(baseURL()).toBe('https://eu1.ironcladapp.com/public/api/v1')
  })

  it('refuses a stored region outside ironcladapp.com', async () => {
    fakeHttp()
    await expect(
      adapter.listEnvelopes({ accessToken: 'tok', extra: { region: 'evil.example' } }, {}),
    ).rejects.toThrow(FOREIGN)
  })
})
