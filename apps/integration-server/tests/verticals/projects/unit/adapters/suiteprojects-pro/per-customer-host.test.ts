/**
 * SuiteProjects Pro (OpenAir) is account-specific: OAuth and REST both live
 * on `{company-id}.app.netsuitesuiteprojectspro.com`. The company ID was a
 * required deployment-config value the admin UI cannot write, so every
 * Connect Link built `https://undefined.app.netsuitesuiteprojectspro.com`.
 * It is now an `oauthField`, validated to stay on that domain, and carried on
 * `credentials.extra`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { SuiteprojectsProAdapter } from '../../../../../../src/verticals/projects/adapters/suiteprojects-pro/index'
import { normaliseCompanyId } from '../../../../../../src/verticals/projects/adapters/suiteprojects-pro/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/projects/suiteprojects-pro/callback',
}
const TOKEN = { access_token: 'tok', refresh_token: 'ref', token_type: 'Bearer', expires_in: 900 }
const REQUIRED = 'SuiteProjects Pro company ID is required.'
const FOREIGN = 'SuiteProjects Pro account must be a *.app.netsuitesuiteprojectspro.com host.'
const NOT_CONFIGURED = 'SuiteProjects Pro company ID is not configured for this connection.'

function fakeHttp() {
  const http = {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  }
  const create = vi
    .spyOn(axios, 'create')
    .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
  return () => (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normaliseCompanyId', () => {
  it.each([
    ['acme', 'acme'],
    [' ACME-Corp ', 'acme-corp'],
    ['acme.app.netsuitesuiteprojectspro.com', 'acme'],
    ['https://acme.app.netsuitesuiteprojectspro.com/login', 'acme'],
  ])('%s → %s', (input, want) => {
    expect(normaliseCompanyId(input)).toBe(want)
  })

  it('rejects blanks with a specific message', () => {
    expect(() => normaliseCompanyId('')).toThrow(REQUIRED)
    expect(() => normaliseCompanyId(undefined)).toThrow(REQUIRED)
  })

  it('rejects hosts outside the account domain — the token exchange carries the client secret', () => {
    expect(() => normaliseCompanyId('evil.example')).toThrow(FOREIGN)
    expect(() => normaliseCompanyId('acme.app.netsuitesuiteprojectspro.com.evil.example')).toThrow(FOREIGN)
    expect(() => normaliseCompanyId('a.b.app.netsuitesuiteprojectspro.com')).toThrow(FOREIGN)
  })

  it('rejects characters that cannot be a host label', () => {
    expect(() => normaliseCompanyId('ac_me')).toThrow(
      'SuiteProjects Pro company ID may only contain letters, digits and "-".',
    )
  })
})

describe('SuiteprojectsProAdapter with a per-customer company ID', () => {
  const adapter = new SuiteprojectsProAdapter(CFG)

  it('declares the company ID as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([expect.objectContaining({ name: 'companyId', required: true })])
  })

  it('builds the authorize URL on the customer account', () => {
    const u = new URL(adapter.getAuthUrl('st', undefined, undefined, { companyId: 'Acme' }))
    expect(u.host).toBe('acme.app.netsuitesuiteprojectspro.com')
    expect(u.pathname).toBe('/login/oauth2/v1/authorize')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('refuses to build an authorize URL when no company ID is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('exchanges on the customer account and stores the company ID in extra', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      companyId: 'https://ACME.app.netsuitesuiteprojectspro.com/',
    })
    expect(post.mock.calls[0][0]).toBe('https://acme.app.netsuitesuiteprojectspro.com/login/oauth2/v1/token')
    expect(creds.extra).toEqual({ companyId: 'acme' })
  })

  it('refuses a foreign host before any request', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { companyId: 'evil.example' }),
    ).rejects.toThrow(FOREIGN)
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses to refresh without a stored company ID instead of posting to a blank host', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.refreshCredentials({ accessToken: 'old', refreshToken: 'ref', extra: {} }),
    ).rejects.toThrow(NOT_CONFIGURED)
    expect(post).not.toHaveBeenCalled()
  })

  it('calls the API on the account stored with the credentials', async () => {
    const baseURL = fakeHttp()
    await adapter.listProjects({ accessToken: 'tok', extra: { companyId: 'acme' } }, {})
    expect(baseURL()).toBe('https://acme.app.netsuitesuiteprojectspro.com/rest/v1')
  })

  it('refuses to call a blank host when the connection has no company ID', async () => {
    fakeHttp()
    await expect(adapter.listProjects({ accessToken: 'tok' }, {})).rejects.toThrow(NOT_CONFIGURED)
  })
})
