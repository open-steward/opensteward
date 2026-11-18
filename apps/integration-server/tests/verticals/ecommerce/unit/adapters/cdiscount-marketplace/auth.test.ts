/**
 * Doc: https://developer.octopia-io.net/user-guides/api-credentials/ — OAuth2
 * client-credentials grant, 2h token lifetime, 500 calls/hour on the token
 * endpoint. Covers: token minting shape, caching (`expiresAt` carries a
 * safety margin so `refreshCredentials` isn't called once per request), and
 * refresh failure when clientId/clientSecret are missing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  fetchToken,
  refreshCredentials,
  exchangeCode,
} from '../../../../../../src/verticals/ecommerce/adapters/cdiscount-marketplace/auth'
import { TOKEN_ENDPOINT, TOKEN_LIFETIME_SECONDS } from '../../../../../../src/verticals/ecommerce/adapters/cdiscount-marketplace/constants'
import { CdiscountMarketplaceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/cdiscount-marketplace/index'

vi.mock('axios')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchToken (Cdiscount Marketplace / Octopia)', () => {
  it('POSTs client_credentials form data to the documented token endpoint', async () => {
    const post = vi.mocked(axios.post).mockResolvedValue({ data: { access_token: 'tok_abc', expires_in: 7200 } })
    await fetchToken('client-1', 'secret-1')
    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe(TOKEN_ENDPOINT)
    expect(String(body)).toBe('grant_type=client_credentials&client_id=client-1&client_secret=secret-1')
    expect((config as { headers: Record<string, string> }).headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
  })

  it('caches the token past its real expiry with a 5-minute safety margin', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { access_token: 'tok_abc', expires_in: 7200 } })
    const before = Date.now()
    const { expiresAt } = await fetchToken('client-1', 'secret-1')
    const ttlMs = expiresAt.getTime() - before
    // 7200s - 300s margin = 6900s, with tolerance for test execution time.
    expect(ttlMs).toBeGreaterThan(6890 * 1000)
    expect(ttlMs).toBeLessThanOrEqual(6900 * 1000)
  })

  it('falls back to the documented 2h-minus-margin lifetime when expires_in is absent', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { access_token: 'tok_abc' } })
    const before = Date.now()
    const { expiresAt } = await fetchToken('client-1', 'secret-1')
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(TOKEN_LIFETIME_SECONDS * 1000)
    expect(expiresAt.getTime() - before).toBeGreaterThan(TOKEN_LIFETIME_SECONDS * 1000 - 5000)
  })

  it('throws when the token endpoint returns no access_token', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} })
    await expect(fetchToken('client-1', 'secret-1')).rejects.toThrow(/empty access_token/)
  })
})

describe('refreshCredentials (Cdiscount Marketplace / Octopia)', () => {
  it('re-mints a token from clientId/clientSecret stashed in credentials.extra', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { access_token: 'tok_new', expires_in: 7200 } })
    const result = await refreshCredentials({
      accessToken: 'tok_old',
      extra: { clientId: 'client-1', clientSecret: 'secret-1', sellerId: 'seller-9' },
    })
    expect(result.accessToken).toBe('tok_new')
    expect(result.extra?.['sellerId']).toBe('seller-9')
  })

  it('throws a clear error when clientId/clientSecret are missing', async () => {
    await expect(refreshCredentials({ accessToken: 'tok_old', extra: {} })).rejects.toThrow(
      /clientId and clientSecret/,
    )
  })
})

describe('exchangeCode (Cdiscount Marketplace / Octopia)', () => {
  it('throws, directing callers to the credential-form flow', () => {
    expect(() => exchangeCode()).toThrow(/client-credentials/)
  })
})

describe('CdiscountMarketplaceAdapter credential form', () => {
  it('declares clientId, clientSecret, sellerId (required) and salesChannelId (optional)', () => {
    const adapter = new CdiscountMarketplaceAdapter()
    const fields = adapter.credentialFields!()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(byName['clientId']?.required).toBe(true)
    expect(byName['clientSecret']?.required).toBe(true)
    expect(byName['sellerId']?.required).toBe(true)
    expect(byName['salesChannelId']?.required).toBe(false)
  })

  it('exchangeCredentials mints a token from the documented endpoint and keeps sellerId', async () => {
    // `oauth2ClientCredentials` captures `globalThis.fetch` when the adapter
    // module is first evaluated, so the module must be re-imported AFTER the
    // stub is installed for it to take effect.
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      async json() {
        return { access_token: 'tok_abc', expires_in: 7200 }
      },
      async text() {
        return ''
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    try {
      const { CdiscountMarketplaceAdapter: FreshAdapter } = await import(
        '../../../../../../src/verticals/ecommerce/adapters/cdiscount-marketplace/index.js'
      )
      const adapter = new FreshAdapter()
      const creds = await adapter.exchangeCredentials!({
        clientId: 'client-1',
        clientSecret: 'secret-1',
        sellerId: 'seller-9',
      })
      expect(creds.accessToken).toBe('tok_abc')
      expect(creds.extra?.['sellerId']).toBe('seller-9')
      const [url] = fetchMock.mock.calls[0]!
      expect(url).toBe(TOKEN_ENDPOINT)
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })
})
