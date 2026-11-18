/**
 * OpenProject is self-hosted or per-tenant cloud: OAuth (`/oauth/authorize`,
 * `/oauth/token`) and API v3 live on the customer's own instance. The
 * instance URL was a REQUIRED deployment-config value the admin UI cannot
 * write, so no Connect Link could build an authorize URL, and refresh ignored
 * the instance stored on the connection. The instance is now an `oauthField`,
 * validated as a public https URL, and carried on `credentials.extra`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { OpenprojectAdapter } from '../../../../../../src/verticals/projects/adapters/openproject/index'
import { normaliseOpenProjectUrl } from '../../../../../../src/verticals/projects/adapters/openproject/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/projects/openproject/callback',
}
const TOKEN = { access_token: 'tok', refresh_token: 'ref', token_type: 'Bearer', expires_in: 7200 }
const REQUIRED = 'OpenProject instance URL is required (e.g. https://acme.openproject.com).'

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

describe('normaliseOpenProjectUrl', () => {
  it.each([
    ['acme.openproject.com', 'https://acme.openproject.com'],
    ['https://Acme.OpenProject.com/', 'https://acme.openproject.com'],
    ['https://example.org/openproject/', 'https://example.org/openproject'],
    [' https://example.org/openproject?x=1#y ', 'https://example.org/openproject'],
  ])('%s → %s', (input, want) => {
    expect(normaliseOpenProjectUrl(input)).toBe(want)
  })

  it('rejects blanks, plain http and non-URLs with specific messages', () => {
    expect(() => normaliseOpenProjectUrl('')).toThrow(REQUIRED)
    expect(() => normaliseOpenProjectUrl(undefined)).toThrow(REQUIRED)
    expect(() => normaliseOpenProjectUrl('http://example.org')).toThrow(
      'OpenProject instance URL must use https.',
    )
    expect(() => normaliseOpenProjectUrl('https://user:pw@example.org')).toThrow(
      'OpenProject instance URL is not a valid https URL.',
    )
  })
})

describe('OpenprojectAdapter with a per-customer instance', () => {
  const adapter = new OpenprojectAdapter(CFG)

  it('declares the instance URL as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'instanceUrl', required: true, type: 'url' }),
    ])
  })

  it('builds the authorize URL on the customer instance', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, { instanceUrl: 'https://example.org/openproject/' }),
    )
    expect(u.origin).toBe('https://example.org')
    expect(u.pathname).toBe('/openproject/oauth/authorize')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('refuses to build an authorize URL when no instance is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('exchanges on the customer instance and stores it in extra', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      instanceUrl: 'Acme.OpenProject.com/',
    })
    expect(post.mock.calls[0][0]).toBe('https://acme.openproject.com/oauth/token')
    expect(creds.extra).toEqual({ instanceUrl: 'https://acme.openproject.com' })
  })

  it('refuses an instance that resolves to a private address before sending the secret', async () => {
    setDnsResolver(async () => [{ address: '127.0.0.1' }])
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { instanceUrl: 'https://op.internal.example' }),
    ).rejects.toThrow('SSRF block: op.internal.example resolved to 127.0.0.1')
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses plain http before any request', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { instanceUrl: 'http://example.org' }),
    ).rejects.toThrow('OpenProject instance URL must use https.')
    expect(post).not.toHaveBeenCalled()
  })

  it('refreshes on the instance stored with the credentials, not deployment config', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await adapter.refreshCredentials({
      accessToken: 'old',
      refreshToken: 'ref',
      extra: { instanceUrl: 'https://acme.openproject.com' },
    })
    expect(post.mock.calls[0][0]).toBe('https://acme.openproject.com/oauth/token')
  })

  it('calls the API on the instance stored with the credentials', async () => {
    const baseURL = fakeHttp()
    await adapter.listProjects(
      { accessToken: 'tok', extra: { instanceUrl: 'https://acme.openproject.com' } },
      {},
    )
    expect(baseURL()).toBe('https://acme.openproject.com/api/v3')
  })
})
