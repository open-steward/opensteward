/**
 * OTTO Market uses OAuth2 client-credentials (`auth_type: oauth2_cc`) — no
 * authorization-code redirect. The Connect page renders `credentialFields()`
 * and calls `exchangeCredentials()` directly, per
 * https://api.otto.market/docs/sellers-integration (client id/secret minted
 * per-seller via OTTO Partner Connect) and
 * https://api.otto.market/docs/category/about-the-api (separate
 * sandbox/production hosts, each with its own `/v1/token` endpoint).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { OttoMarketAdapter } from '../../../../../../src/verticals/ecommerce/adapters/otto-market/index'
import { tokenUrlFor, baseUrlFor } from '../../../../../../src/verticals/ecommerce/adapters/otto-market/auth'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('tokenUrlFor / baseUrlFor', () => {
  it('routes production and sandbox to their own hosts', () => {
    expect(baseUrlFor('production')).toBe('https://api.otto.market')
    expect(baseUrlFor('sandbox')).toBe('https://sandbox.api.otto.market')
    expect(baseUrlFor(undefined)).toBe('https://api.otto.market')
    expect(tokenUrlFor('sandbox')).toBe('https://sandbox.api.otto.market/v1/token')
    expect(tokenUrlFor('production')).toBe('https://api.otto.market/v1/token')
  })
})

describe('OttoMarketAdapter credential form', () => {
  const adapter = new OttoMarketAdapter()

  it('declares clientId, clientSecret and an environment select', () => {
    const fields = adapter.credentialFields!()
    expect(fields.map((f) => f.name)).toEqual(['clientId', 'clientSecret', 'environment'])
    const env = fields.find((f) => f.name === 'environment')!
    expect(env.type).toBe('select')
    expect(env.options?.map((o) => o.value).sort()).toEqual(['production', 'sandbox'])
  })

  // `exchangeCredentials` comes from the shared `oauth2ClientCredentials`
  // template (packages/shared/src/adapter/credential-templates.ts), which
  // captures `globalThis.fetch` once, at module-evaluation time, into the
  // `CREDENTIAL_FORM` constant — so `vi.stubGlobal('fetch', ...)` only takes
  // effect for a copy of the adapter module imported AFTER the stub is in
  // place. `vi.resetModules()` + a dynamic re-import gets a fresh copy.
  async function freshAdapterWithFetch(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    const mod = await import('../../../../../../src/verticals/ecommerce/adapters/otto-market/index.js')
    return new mod.OttoMarketAdapter()
  }

  it('exchanges against the sandbox token endpoint when environment=sandbox', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok-sandbox', expires_in: 1800, scope: 'orders' }),
    })
    const fresh = await freshAdapterWithFetch(fetchMock)
    const creds = await fresh.exchangeCredentials!({
      clientId: 'cid',
      clientSecret: 'sec',
      environment: 'sandbox',
    })
    expect(fetchMock.mock.calls[0]![0]).toBe('https://sandbox.api.otto.market/v1/token')
    expect(creds.accessToken).toBe('tok-sandbox')
    expect(creds.extra).toMatchObject({ clientId: 'cid', clientSecret: 'sec', environment: 'sandbox' })
    expect(creds.expiresAt).toBeInstanceOf(Date)
  })

  it('exchanges against the production token endpoint when environment=production', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok-prod', expires_in: 1800 }),
    })
    const fresh = await freshAdapterWithFetch(fetchMock)
    await fresh.exchangeCredentials!({
      clientId: 'cid',
      clientSecret: 'sec',
      environment: 'production',
    })
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.otto.market/v1/token')
  })

  it('rejects a missing clientId/clientSecret before ever calling the token endpoint', async () => {
    const fetchMock = vi.fn()
    await expect(
      adapter.exchangeCredentials!({ clientId: '', clientSecret: '', environment: 'production' }),
    ).rejects.toThrow(/client/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('OttoMarketAdapter.refreshCredentials', () => {
  const adapter = new OttoMarketAdapter()

  it('re-mints a token against the environment stashed in extra', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok-2', expires_in: 1800 } })
    const refreshed = await adapter.refreshCredentials({
      accessToken: 'old',
      extra: { clientId: 'cid', clientSecret: 'sec', environment: 'sandbox' },
    })
    expect(post.mock.calls[0]![0]).toBe('https://sandbox.api.otto.market/v1/token')
    expect(refreshed.accessToken).toBe('tok-2')
  })

  it('throws a readable error when clientId/clientSecret were never stored', async () => {
    await expect(adapter.refreshCredentials({ accessToken: 'old' })).rejects.toThrow(
      /clientId and clientSecret/i,
    )
  })
})

describe('OttoMarketAdapter.getAuthUrl / exchangeCode', () => {
  const adapter = new OttoMarketAdapter()

  it('getAuthUrl throws — there is no user-consent redirect for client-credentials', () => {
    expect(() => adapter.getAuthUrl('state')).toThrow(/client-credentials/i)
  })

  it('exchangeCode throws without deployment-level clientId/clientSecret configured', async () => {
    await expect(adapter.exchangeCode('code', 'https://cb')).rejects.toThrow(/clientId/i)
  })
})
