/**
 * Acumatica is per-instance: authorize, token and REST endpoints all live on
 * the customer's own site URL (Acumatica-hosted `*.acumatica.com` or a
 * self-hosted server, optionally in a virtual directory). The adapter used to
 * read that URL only from deployment config — which the admin UI cannot set —
 * so a Connect Link customer got an authorize URL of `undefined/identity/...`.
 *
 * The instance URL is now an `oauthField`. It reaches `getAuthUrl`, the token
 * exchange (which carries the client secret, so the host is SSRF-checked
 * first), and — via `credentials.extra.instanceUrl` — the API client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { setDnsResolver, SsrfBlockedError } from '@opensteward/shared'
import { AcumaticaAdapter } from '../../../../../../src/verticals/accounting/adapters/acumatica/index'
import { normaliseInstanceUrl } from '../../../../../../src/verticals/accounting/adapters/acumatica/auth'

const CFG = {
  clientId: 'cid@Company',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/accounting/acumatica/callback',
  scopes: ['api', 'offline_access'],
}

beforeEach(() => {
  vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
})

afterEach(() => {
  setDnsResolver(undefined)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('normaliseInstanceUrl', () => {
  it.each([
    ['https://acme.acumatica.com', 'https://acme.acumatica.com'],
    ['https://acme.acumatica.com/', 'https://acme.acumatica.com'],
    ['  https://ACME.Acumatica.com/  ', 'https://acme.acumatica.com'],
    ['acme.acumatica.com', 'https://acme.acumatica.com'],
    ['https://erp.example.com/AcumaticaERP/', 'https://erp.example.com/AcumaticaERP'],
    ['https://erp.example.com/AcumaticaERP/Main.aspx?ScreenId=00000000#x', 'https://erp.example.com/AcumaticaERP/Main.aspx'],
  ])('%s → %s', (input, want) => {
    expect(normaliseInstanceUrl(input)).toBe(want)
  })

  it('rejects blanks with a message that names what is missing', () => {
    for (const blank of ['', '   ', undefined]) {
      expect(() => normaliseInstanceUrl(blank)).toThrow('Acumatica instance URL is required')
    }
  })

  it('refuses plain http — the token exchange sends the client secret', () => {
    expect(() => normaliseInstanceUrl('http://acme.acumatica.com')).toThrow(
      'Acumatica instance URL must use https',
    )
  })

  it('refuses URLs carrying credentials or that do not parse', () => {
    expect(() => normaliseInstanceUrl('https://user:pw@acme.acumatica.com')).toThrow(
      'Acumatica instance URL must not contain a username or password',
    )
    expect(() => normaliseInstanceUrl('https://exa mple.com')).toThrow(
      'Acumatica instance URL is not a valid URL',
    )
  })
})

describe('AcumaticaAdapter with a per-customer instance', () => {
  const adapter = new AcumaticaAdapter(CFG)

  it('declares the instance URL as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'instanceUrl', required: true, type: 'url' }),
    ])
    // The oauth2 hook replaces it: credentialFields is never rendered for an
    // oauth2 adapter, so declaring it too would only hide the real hook.
    expect((adapter as { credentialFields?: unknown }).credentialFields).toBeUndefined()
  })

  it('builds the authorize URL on the customer’s instance', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, { instanceUrl: 'https://erp.example.com/AcumaticaERP/' }),
    )
    expect(u.origin + u.pathname).toBe('https://erp.example.com/AcumaticaERP/identity/connect/authorize')
    expect(u.searchParams.get('state')).toBe('st')
    expect(u.searchParams.get('client_id')).toBe('cid@Company')
  })

  it('refuses to build an authorize URL when no instance is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow('Acumatica instance URL is required')
  })

  it('exchanges the code on that instance and stores the normalised URL in extra', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok', refresh_token: 'rt', expires_in: 3600 } })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      instanceUrl: ' https://ACME.acumatica.com/ ',
    })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe('https://acme.acumatica.com/identity/connect/token')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ instanceUrl: 'https://acme.acumatica.com' })
  })

  it('refuses to send the client secret to an instance that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '10.0.0.5' }])
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { instanceUrl: 'https://internal.example.com' }),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a blank or http instance before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { instanceUrl: '' }),
    ).rejects.toThrow('Acumatica instance URL is required')
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { instanceUrl: 'http://acme.acumatica.com' }),
    ).rejects.toThrow('Acumatica instance URL must use https')
    expect(post).not.toHaveBeenCalled()
  })

  it('refreshes on the instance stored with the credentials, keeping it in extra', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok2', expires_in: 3600 } })
    const creds = await adapter.refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      extra: { instanceUrl: 'https://acme.acumatica.com' },
    })
    expect(post.mock.calls[0][0]).toBe('https://acme.acumatica.com/identity/connect/token')
    expect(creds.extra).toEqual({ instanceUrl: 'https://acme.acumatica.com' })
    expect(creds.refreshToken).toBe('rt')
  })

  it('calls the API on the instance stored with the credentials', async () => {
    const create = vi.spyOn(axios, 'create')
    await adapter
      .getOrganization({ accessToken: 'tok', extra: { instanceUrl: 'https://acme.acumatica.com' } })
      .catch(() => undefined) // the request itself is not under test
    const baseURL = (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
    expect(baseURL).toBe('https://acme.acumatica.com/entity/Default/24.200.001/')
  })

  it('refuses to call the API when the credentials carry no instance', async () => {
    const create = vi.spyOn(axios, 'create')
    await expect(adapter.getOrganization({ accessToken: 'tok' })).rejects.toThrow(
      'Acumatica instance URL is missing from the connection',
    )
    expect(create).not.toHaveBeenCalled()
  })
})
