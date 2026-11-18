/**
 * Accelo hosts every tenant on its own deployment subdomain:
 * `{deployment}.api.accelo.com` serves the authorize endpoint, the token
 * endpoint and the API. The adapter used to read the deployment from its
 * deployment-level config — which the admin UI cannot set — so a Connect Link
 * built `https://.api.accelo.com/...` and every connection died.
 *
 * The deployment is now an `oauthField` the customer supplies before the
 * redirect. It reaches the authorize URL, the token exchange, and (via
 * `credentials.extra.deployment`) the API client.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { AcceloAdapter } from '../../../../../../src/verticals/crm/adapters/accelo/index'
import { normaliseDeployment } from '../../../../../../src/verticals/crm/adapters/accelo/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/crm/accelo/callback',
}

const REQUIRED = 'Accelo deployment is required (e.g. mycompany for mycompany.accelo.com).'
const FOREIGN = 'Accelo deployment must be a *.accelo.com host.'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normaliseDeployment', () => {
  it.each([
    ['planet-express', 'planet-express'],
    ['planet-express.accelo.com', 'planet-express'],
    ['planet-express.api.accelo.com', 'planet-express'],
    ['https://planet-express.accelo.com/', 'planet-express'],
    ['https://planet-express.api.accelo.com/api/v0', 'planet-express'],
    ['  Planet-Express.ACCELO.com ', 'planet-express'],
  ])('%s → %s', (input, want) => {
    expect(normaliseDeployment(input)).toBe(want)
  })

  it('rejects blanks before anything is built', () => {
    expect(() => normaliseDeployment('')).toThrow(REQUIRED)
    expect(() => normaliseDeployment('   ')).toThrow(REQUIRED)
    expect(() => normaliseDeployment(undefined)).toThrow(REQUIRED)
  })

  it('rejects hosts outside accelo.com — the token exchange carries the client secret', () => {
    expect(() => normaliseDeployment('evil.example.com')).toThrow(FOREIGN)
    expect(() => normaliseDeployment('acme.accelo.com.evil.example')).toThrow(FOREIGN)
    expect(() => normaliseDeployment('a.b.accelo.com')).toThrow(FOREIGN)
    expect(() => normaliseDeployment('under_score')).toThrow(FOREIGN)
  })
})

describe('AcceloAdapter with a per-customer deployment', () => {
  const adapter = new AcceloAdapter(CFG)

  it('declares the deployment as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'deployment', required: true, type: 'text' }),
    ])
  })

  it('builds the authorize URL on the customer’s deployment', () => {
    const u = new URL(
      adapter.getAuthUrl('st', ['read(all)'], undefined, { deployment: 'Acme.accelo.com' }),
    )
    expect(u.origin).toBe('https://acme.api.accelo.com')
    expect(u.pathname).toBe('/oauth2/v0/authorize')
    expect(u.searchParams.get('state')).toBe('st')
    expect(u.searchParams.get('scope')).toBe('read(all)')
  })

  it('refuses to build an authorize URL with no deployment instead of a hostless placeholder', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('exchanges the code on the customer’s deployment with HTTP Basic client auth and stores it in extra', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ access_token: 'tok', refresh_token: 'rt', expires_in: 3600 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      deployment: 'https://acme.accelo.com/',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://acme.api.accelo.com/oauth2/v0/token')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Basic ${Buffer.from('cid:sec').toString('base64')}`)
    expect(String(init.body)).not.toContain('client_secret')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ deployment: 'acme' })
  })

  it('rejects a foreign deployment before any request is made', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
        deployment: 'acme.accelo.com.evil.example',
      }),
    ).rejects.toThrow(FOREIGN)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes on the deployment stored with the credentials', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: 'new', expires_in: 3600 }))
    vi.stubGlobal('fetch', fetchMock)
    await new AcceloAdapter({ ...CFG, deployment: 'other' }).refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      extra: { deployment: 'acme' },
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://acme.api.accelo.com/oauth2/v0/token',
    )
  })

  it('calls the API on the deployment stored with the credentials', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ meta: { status: 'ok', message: '' }, response: [] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await adapter
      .listContacts({ accessToken: 'tok', extra: { deployment: 'acme' } }, {})
      .catch(() => undefined) // the response handling is not under test
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0])
    expect(url.origin).toBe('https://acme.api.accelo.com')
    expect(url.pathname).toBe('/api/v0/contacts')
  })

  it('refuses to send the bearer token to a stored deployment outside accelo.com', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.listContacts({ accessToken: 'tok', extra: { deployment: 'evil.example.com' } }, {}),
    ).rejects.toThrow(FOREIGN)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
