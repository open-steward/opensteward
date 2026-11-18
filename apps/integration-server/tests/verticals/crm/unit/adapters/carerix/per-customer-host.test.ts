/**
 * Carerix runs a Keycloak realm per customer ("system name") on one of
 * several identity servers (`id.carerix.io`, `id-2.carerix.io`, …). The realm
 * was read from deployment-level config that the admin UI cannot set, so a
 * Connect Link produced `https://id.carerix.io/auth/realms//protocol/...`.
 *
 * The realm and the identity server are now `oauthFields` the customer
 * supplies before the redirect, and they travel in `credentials.extra` so a
 * refresh goes back to the same realm.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CarerixAdapter } from '../../../../../../src/verticals/crm/adapters/carerix/index'
import {
  normaliseTenantSlug,
  normaliseIdentityServer,
} from '../../../../../../src/verticals/crm/adapters/carerix/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/crm/carerix/callback',
}

const REQUIRED = 'Carerix system name is required (e.g. acmedemo).'
const BAD_SLUG = 'Carerix system name may contain only letters, digits, hyphens and underscores.'
const FOREIGN = 'Carerix identity server must be an id*.carerix.io host.'

function tokenResponse(): Response {
  return new Response(
    JSON.stringify({ access_token: 'tok', refresh_token: 'rt', expires_in: 300 }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normaliseTenantSlug', () => {
  it('trims and keeps a valid system name', () => {
    expect(normaliseTenantSlug('  acmedemo ')).toBe('acmedemo')
    expect(normaliseTenantSlug('acme-demo_2')).toBe('acme-demo_2')
  })

  it('rejects blanks', () => {
    expect(() => normaliseTenantSlug('')).toThrow(REQUIRED)
    expect(() => normaliseTenantSlug('  ')).toThrow(REQUIRED)
    expect(() => normaliseTenantSlug(undefined)).toThrow(REQUIRED)
  })

  it('rejects anything that is not a bare realm name', () => {
    expect(() => normaliseTenantSlug('acme/../master')).toThrow(BAD_SLUG)
    expect(() => normaliseTenantSlug('acme demo')).toThrow(BAD_SLUG)
  })
})

describe('normaliseIdentityServer', () => {
  it.each([
    [undefined, 'id.carerix.io'],
    ['', 'id.carerix.io'],
    ['id', 'id.carerix.io'],
    ['id-2', 'id-2.carerix.io'],
    ['ID-3.carerix.io', 'id-3.carerix.io'],
    ['https://id-2.carerix.io/auth/realms/acme', 'id-2.carerix.io'],
  ])('%s → %s', (input, want) => {
    expect(normaliseIdentityServer(input)).toBe(want)
  })

  it('rejects hosts that are not a Carerix identity server', () => {
    expect(() => normaliseIdentityServer('evil.example.com')).toThrow(FOREIGN)
    expect(() => normaliseIdentityServer('id.carerix.io.evil.example')).toThrow(FOREIGN)
    expect(() => normaliseIdentityServer('api.carerix.io')).toThrow(FOREIGN)
  })
})

describe('CarerixAdapter with a per-customer realm', () => {
  const adapter = new CarerixAdapter(CFG)

  it('declares the system name (required) and identity server (optional) as oauthFields', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'tenantSlug', required: true, type: 'text' }),
      expect.objectContaining({ name: 'identityServer', required: false, type: 'select' }),
    ])
  })

  it('builds the authorize URL on the customer’s realm and identity server', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, {
        tenantSlug: 'acmedemo',
        identityServer: 'id-2.carerix.io',
      }),
    )
    expect(u.origin).toBe('https://id-2.carerix.io')
    expect(u.pathname).toBe('/auth/realms/acmedemo/protocol/openid-connect/auth')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('refuses to build an authorize URL with no system name', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
  })

  it('exchanges the code on the customer’s realm and stores both values in extra', async () => {
    const fetchMock = vi.fn(async () => tokenResponse())
    vi.stubGlobal('fetch', fetchMock)
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      tenantSlug: ' acmedemo ',
      identityServer: 'id-3',
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://id-3.carerix.io/auth/realms/acmedemo/protocol/openid-connect/token',
    )
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ tenantSlug: 'acmedemo', identityServer: 'id-3.carerix.io' })
  })

  it('rejects a foreign identity server before any request is made', async () => {
    const fetchMock = vi.fn(async () => tokenResponse())
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
        tenantSlug: 'acmedemo',
        identityServer: 'id.carerix.io.evil.example',
      }),
    ).rejects.toThrow(FOREIGN)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a blank system name before any request is made', async () => {
    const fetchMock = vi.fn(async () => tokenResponse())
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { tenantSlug: ' ' }),
    ).rejects.toThrow(REQUIRED)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes on the realm stored with the credentials, not on config', async () => {
    const fetchMock = vi.fn(async () => tokenResponse())
    vi.stubGlobal('fetch', fetchMock)
    const configured = new CarerixAdapter({ ...CFG, tenantSlug: 'other' })
    await configured.refreshCredentials({
      accessToken: 'old',
      refreshToken: 'rt',
      extra: { tenantSlug: 'acmedemo', identityServer: 'id-2.carerix.io' },
    })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://id-2.carerix.io/auth/realms/acmedemo/protocol/openid-connect/token',
    )
  })
})
