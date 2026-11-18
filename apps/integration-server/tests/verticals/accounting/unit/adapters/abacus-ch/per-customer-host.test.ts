/**
 * Abacus is tenant-hosted: every customer's Abacus server (self-hosted or
 * Abacus-hosted) serves its own OAuth endpoints (`/oauth/oauth2/v1/auth`,
 * `/oauth/oauth2/v1/token`) and REST API (`/api/entity/v1`). The adapter read
 * that server URL only from deployment config — which the admin UI cannot
 * set — so a Connect Link customer got an authorize URL of
 * `undefined/oauth/oauth2/v1/auth`.
 *
 * The server URL is now an `oauthField`. It reaches `getAuthUrl`, the token
 * exchange (SSRF-checked first: it carries the client secret), and — via
 * `credentials.extra.tenantBaseUrl` — the API client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { setDnsResolver, SsrfBlockedError } from '@opensteward/shared'
import { AbacusChAdapter } from '../../../../../../src/verticals/accounting/adapters/abacus-ch/index'
import { normaliseTenantBaseUrl } from '../../../../../../src/verticals/accounting/adapters/abacus-ch/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/accounting/abacus-ch/callback',
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

describe('normaliseTenantBaseUrl', () => {
  it.each([
    ['https://abacus.example.ch', 'https://abacus.example.ch'],
    ['https://abacus.example.ch/', 'https://abacus.example.ch'],
    ['  HTTPS://Abacus.Example.CH:40000/portal/abajournal?x=1  ', 'https://abacus.example.ch:40000'],
    ['abacus.example.ch', 'https://abacus.example.ch'],
  ])('%s → %s', (input, want) => {
    expect(normaliseTenantBaseUrl(input)).toBe(want)
  })

  it('rejects blanks with a message that names what is missing', () => {
    for (const blank of ['', '   ', undefined]) {
      expect(() => normaliseTenantBaseUrl(blank)).toThrow('Abacus server URL is required')
    }
  })

  it('refuses plain http, embedded credentials and unparseable input', () => {
    expect(() => normaliseTenantBaseUrl('http://abacus.example.ch')).toThrow(
      'Abacus server URL must use https',
    )
    expect(() => normaliseTenantBaseUrl('https://u:p@abacus.example.ch')).toThrow(
      'Abacus server URL must not contain a username or password',
    )
    expect(() => normaliseTenantBaseUrl('https://aba cus.example.ch')).toThrow(
      'Abacus server URL is not a valid URL',
    )
  })
})

describe('AbacusChAdapter with a per-customer server', () => {
  const adapter = new AbacusChAdapter(CFG)

  it('declares the server URL as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'tenantBaseUrl', required: true, type: 'url' }),
    ])
    // The oauth2 hook replaces it: credentialFields is never rendered for an
    // oauth2 adapter, so declaring it too would only hide the real hook.
    expect((adapter as { credentialFields?: unknown }).credentialFields).toBeUndefined()
  })

  it('builds the authorize URL on the customer’s server', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, { tenantBaseUrl: 'https://Abacus.Example.ch/' }),
    )
    expect(u.origin + u.pathname).toBe('https://abacus.example.ch/oauth/oauth2/v1/auth')
    expect(u.searchParams.get('state')).toBe('st')
    expect(u.searchParams.get('client_id')).toBe('cid')
  })

  it('refuses to build an authorize URL when no server is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow('Abacus server URL is required')
  })

  it('exchanges the code on that server and stores the normalised URL', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok', refresh_token: 'rt', expires_in: 600 } })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      tenantBaseUrl: 'abacus.example.ch/',
    })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe('https://abacus.example.ch/oauth/oauth2/v1/token')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ tenantBaseUrl: 'https://abacus.example.ch' })
    expect(creds.tenantId).toBe('https://abacus.example.ch')
  })

  it('refuses to send the client secret to a server that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '192.168.1.20' }])
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { tenantBaseUrl: 'https://abacus.internal.example' }),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a blank or http server before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { tenantBaseUrl: ' ' }),
    ).rejects.toThrow('Abacus server URL is required')
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { tenantBaseUrl: 'http://abacus.example.ch' }),
    ).rejects.toThrow('Abacus server URL must use https')
    expect(post).not.toHaveBeenCalled()
  })

  it('refreshes on the stored server and keeps it', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok2', expires_in: 600 } })
    const creds = await adapter.refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      extra: { tenantBaseUrl: 'https://abacus.example.ch' },
    })
    expect(post.mock.calls[0][0]).toBe('https://abacus.example.ch/oauth/oauth2/v1/token')
    expect(creds.extra).toEqual({ tenantBaseUrl: 'https://abacus.example.ch' })
    expect(creds.refreshToken).toBe('rt')
  })

  it('calls the API on the server stored with the credentials', async () => {
    const create = vi.spyOn(axios, 'create')
    await adapter
      .getOrganization({ accessToken: 'tok', extra: { tenantBaseUrl: 'https://abacus.example.ch' } })
      .catch(() => undefined) // the request itself is not under test
    const baseURL = (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
    expect(baseURL).toBe('https://abacus.example.ch/api/entity/v1/')
  })

  it('refuses to call the API when the credentials carry no server', async () => {
    const create = vi.spyOn(axios, 'create')
    await expect(adapter.getOrganization({ accessToken: 'tok' })).rejects.toThrow(
      'Abacus server URL is missing from the connection',
    )
    expect(create).not.toHaveBeenCalled()
  })
})
