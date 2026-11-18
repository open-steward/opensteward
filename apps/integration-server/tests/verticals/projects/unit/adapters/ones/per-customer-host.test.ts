/**
 * ONES OAuth and the OpenAPI both live on the customer's own ONES domain
 * (`https://your-domain/oauth2/token`, `https://your-domain/openapi/v2`).
 * The domain used to come only from deployment config — which the admin UI
 * cannot write — so every connection fell back to a guessed `https://ones.com`.
 * It is now an `oauthField`, validated as a public https origin, and carried
 * on `credentials.extra`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { OnesAdapter } from '../../../../../../src/verticals/projects/adapters/ones/index'
import { normaliseOnesDomain } from '../../../../../../src/verticals/projects/adapters/ones/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/projects/ones/callback',
}
const TOKEN = { access_token: 'tok', refresh_token: 'ref', token_type: 'Bearer', expires_in: 3600, user_id: 'u1' }
const REQUIRED = 'ONES domain is required (e.g. https://acme.ones.com).'

function fakeHttp() {
  const http = { get: vi.fn().mockResolvedValue({ data: {} }) }
  const create = vi
    .spyOn(axios, 'create')
    .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
  return () => (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
}

beforeEach(() => {
  delete process.env['OST_ALLOW_PRIVATE_HOSTS']
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
})

afterEach(() => {
  setDnsResolver(undefined)
  vi.restoreAllMocks()
})

describe('normaliseOnesDomain', () => {
  it.each([
    ['acme.ones.com', 'https://acme.ones.com'],
    ['https://acme.ones.com/', 'https://acme.ones.com'],
    ['https://ONES.Example.cn/project/#/team/x', 'https://ones.example.cn'],
    [' https://ones.example.cn:8443/ ', 'https://ones.example.cn:8443'],
  ])('%s → %s', (input, want) => {
    expect(normaliseOnesDomain(input)).toBe(want)
  })

  it('rejects blanks, plain http and non-URLs with specific messages', () => {
    expect(() => normaliseOnesDomain('')).toThrow(REQUIRED)
    expect(() => normaliseOnesDomain(undefined)).toThrow(REQUIRED)
    expect(() => normaliseOnesDomain('http://ones.example.cn')).toThrow('ONES domain must use https.')
    expect(() => normaliseOnesDomain('https://user:pw@ones.example.cn')).toThrow(
      'ONES domain is not a valid https URL.',
    )
    expect(() => normaliseOnesDomain('not a domain')).toThrow('ONES domain is not a valid https URL.')
  })
})

describe('OnesAdapter with a per-customer domain', () => {
  const adapter = new OnesAdapter(CFG)

  it('declares the domain as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([expect.objectContaining({ name: 'domain', required: true })])
  })

  it('builds the authorize URL on the customer domain', () => {
    const u = new URL(adapter.getAuthUrl('st', undefined, undefined, { domain: 'ones.example.cn' }))
    expect(u.origin).toBe('https://ones.example.cn')
    expect(u.pathname).toBe('/oauth2/authorize')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('refuses to fall back to a guessed domain', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('exchanges on the customer domain and stores it in extra', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      domain: 'https://ONES.example.cn/project/',
    })
    expect(post.mock.calls[0][0]).toBe('https://ones.example.cn/oauth2/token')
    expect(creds.extra).toEqual({ userId: 'u1', domain: 'https://ones.example.cn' })
  })

  it('refuses a domain that resolves to a private address before sending the secret', async () => {
    setDnsResolver(async () => [{ address: '192.168.1.20' }])
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { domain: 'ones.corp.example' }),
    ).rejects.toThrow('SSRF block: ones.corp.example resolved to 192.168.1.20')
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses plain http before any request', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { domain: 'http://ones.example.cn' }),
    ).rejects.toThrow('ONES domain must use https.')
    expect(post).not.toHaveBeenCalled()
  })

  it('refreshes on the domain stored with the credentials', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await adapter.refreshCredentials({
      accessToken: 'old',
      refreshToken: 'ref',
      extra: { domain: 'https://ones.example.cn' },
    })
    expect(post.mock.calls[0][0]).toBe('https://ones.example.cn/oauth2/token')
  })

  it('calls the API on the domain stored with the credentials', async () => {
    const baseURL = fakeHttp()
    await adapter.listProjects({ accessToken: 'tok', extra: { domain: 'https://ones.example.cn' } }, {})
    expect(baseURL()).toBe('https://ones.example.cn/openapi/v2')
  })

  it('refuses to call a guessed domain when the connection has none', async () => {
    fakeHttp()
    await expect(adapter.listProjects({ accessToken: 'tok' }, {})).rejects.toThrow(
      'ONES domain is not configured for this connection.',
    )
  })
})
