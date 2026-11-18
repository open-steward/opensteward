/**
 * Adobe Workfront OAuth and REST live on the customer's own Workfront domain
 * (`https://<org>.my.workfront.com`, or `<org>.my.workfront.adobe.com` after
 * Unified Shell onboarding). The domain was a required deployment-config
 * value the admin UI cannot write, so every Connect Link built
 * `undefined/integrations/oauth2/authorize`. It is now an `oauthField`,
 * validated to stay on a Workfront domain, and carried on `credentials.extra`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { WorkfrontAdapter } from '../../../../../../src/verticals/projects/adapters/workfront/index'
import { normaliseWorkfrontDomain } from '../../../../../../src/verticals/projects/adapters/workfront/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/projects/workfront/callback',
}
const TOKEN = { access_token: 'tok', refresh_token: 'ref', token_type: 'sessionID', expires_in: 3600 }
const REQUIRED = 'Workfront domain is required (e.g. myorg.my.workfront.com).'
const FOREIGN = 'Workfront domain must be a *.workfront.com or *.workfront.adobe.com host.'
const NOT_CONFIGURED = 'Workfront domain is not configured for this connection.'

function fakeHttp() {
  const http = { get: vi.fn().mockResolvedValue({ data: {} }) }
  const create = vi
    .spyOn(axios, 'create')
    .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
  return () => (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normaliseWorkfrontDomain', () => {
  it.each([
    ['myorg', 'https://myorg.my.workfront.com'],
    ['myorg.my.workfront.com', 'https://myorg.my.workfront.com'],
    [' https://MyOrg.my.workfront.com/home/projects ', 'https://myorg.my.workfront.com'],
    ['acme.sb01.workfront.com', 'https://acme.sb01.workfront.com'],
    ['acme.my.workfront.adobe.com', 'https://acme.my.workfront.adobe.com'],
  ])('%s → %s', (input, want) => {
    expect(normaliseWorkfrontDomain(input)).toBe(want)
  })

  it('rejects blanks and plain http with specific messages', () => {
    expect(() => normaliseWorkfrontDomain('')).toThrow(REQUIRED)
    expect(() => normaliseWorkfrontDomain(undefined)).toThrow(REQUIRED)
    expect(() => normaliseWorkfrontDomain('http://myorg.my.workfront.com')).toThrow(
      'Workfront domain must use https.',
    )
  })

  it('rejects hosts outside Workfront — the token exchange carries the client secret', () => {
    expect(() => normaliseWorkfrontDomain('evil.example')).toThrow(FOREIGN)
    expect(() => normaliseWorkfrontDomain('myorg.my.workfront.com.evil.example')).toThrow(FOREIGN)
    expect(() => normaliseWorkfrontDomain('workfront.com')).toThrow(FOREIGN)
    expect(() => normaliseWorkfrontDomain('experience.adobe.com')).toThrow(FOREIGN)
  })
})

describe('WorkfrontAdapter with a per-customer domain', () => {
  const adapter = new WorkfrontAdapter(CFG)

  it('declares the domain as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([expect.objectContaining({ name: 'instanceUrl', required: true })])
  })

  it('builds the authorize URL on the customer domain', () => {
    const u = new URL(adapter.getAuthUrl('st', undefined, undefined, { instanceUrl: 'myorg' }))
    expect(u.host).toBe('myorg.my.workfront.com')
    expect(u.pathname).toBe('/integrations/oauth2/authorize')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('refuses to build an authorize URL when no domain is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('exchanges on the customer domain and stores it in extra', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      instanceUrl: 'https://MyOrg.my.workfront.com/',
    })
    expect(post.mock.calls[0][0]).toBe('https://myorg.my.workfront.com/integrations/oauth2/api/v1/token')
    expect(creds.extra).toEqual({ instanceUrl: 'https://myorg.my.workfront.com' })
  })

  it('refuses a foreign host before any request', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { instanceUrl: 'evil.example' }),
    ).rejects.toThrow(FOREIGN)
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses to refresh without a stored domain instead of posting to a relative URL', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.refreshCredentials({ accessToken: 'old', refreshToken: 'ref', extra: {} }),
    ).rejects.toThrow(NOT_CONFIGURED)
    expect(post).not.toHaveBeenCalled()
  })

  it('calls the API on the domain stored with the credentials', async () => {
    const baseURL = fakeHttp()
    await adapter.listProjects(
      { accessToken: 'tok', extra: { instanceUrl: 'https://myorg.my.workfront.com' } },
      {},
    )
    expect(baseURL()).toBe('https://myorg.my.workfront.com/attask/api/v15.0')
  })

  it('refuses to call a relative URL when the connection has no domain', async () => {
    fakeHttp()
    await expect(adapter.listProjects({ accessToken: 'tok' }, {})).rejects.toThrow(NOT_CONFIGURED)
  })
})
