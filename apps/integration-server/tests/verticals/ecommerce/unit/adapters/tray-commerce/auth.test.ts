/**
 * Docs: https://developers.tray.com.br/ `#autorizacao`,
 * `#gerar-chaves-de-acesso-post`, `#atualizar-chave-de-acesso-get` — the
 * only three sections whose field-level content was retrieved in full (see
 * auth.ts header for the exact quotes and the one documented gap around
 * `state`).
 *
 * Tray is a per-customer-host OAuth2 platform like Shopify/Zendesk in this
 * vertical: the app's `consumer_key`/`consumer_secret` are fixed, but the
 * authorize URL, the token-exchange host and the refresh host all live on
 * the customer's own store domain. The token exchange and refresh both
 * carry the consumer secret, so both must reject a private/loopback host
 * and a non-https scheme before sending it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { setDnsResolver, SsrfBlockedError } from '@opensteward/shared'
import { TrayCommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/tray-commerce'

const PUBLIC = async () => [{ address: '93.184.216.34' }]

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      message: 'Success',
      code: 200,
      access_token: 'access-tok',
      refresh_token: 'refresh-tok',
      date_expiration_access_token: '2026-03-01T00:00:00.000Z',
      api_host: 'https://minhaloja.commercesuite.com.br/web_api',
      store_id: 391250,
      ...overrides,
    },
  }
}

let postSpy: ReturnType<typeof vi.spyOn>
let getSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  setDnsResolver(PUBLIC)
  postSpy = vi.spyOn(axios, 'post').mockResolvedValue(tokenResponse())
  getSpy = vi.spyOn(axios, 'get').mockResolvedValue(tokenResponse())
})

afterEach(() => {
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

const CONFIG = {
  clientId: 'consumer-key-123',
  clientSecret: 'consumer-secret-abc',
  redirectUri: 'https://ourapp.example/auth/ecommerce/tray-commerce/callback',
}

describe('TrayCommerceAdapter auth', () => {
  const adapter = new TrayCommerceAdapter(CONFIG)

  it('collects the store domain on the Connect page (per-customer host, not a fixed config value)', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'storeDomain', required: true }),
    ])
  })

  it('builds the authorize URL on the customer store, embedding state in the callback', () => {
    const url = adapter.getAuthUrl('state-xyz', undefined, undefined, {
      storeDomain: 'minhaloja.commercesuite.com.br',
    })
    const parsed = new URL(url)
    expect(parsed.origin).toBe('https://minhaloja.commercesuite.com.br')
    expect(parsed.pathname).toBe('/auth.php')
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('consumer_key')).toBe('consumer-key-123')
    const callback = new URL(parsed.searchParams.get('callback')!)
    expect(callback.origin + callback.pathname).toBe(
      'https://ourapp.example/auth/ecommerce/tray-commerce/callback',
    )
    expect(callback.searchParams.get('state')).toBe('state-xyz')
  })

  it('normalises a pasted admin URL down to the bare host', () => {
    const url = adapter.getAuthUrl('s', undefined, undefined, {
      storeDomain: '  https://Minhaloja.Commercesuite.com.br/admin/login  ',
    })
    expect(new URL(url).hostname).toBe('minhaloja.commercesuite.com.br')
  })

  it('throws a readable error rather than building a URL with no store domain', () => {
    expect(() => adapter.getAuthUrl('s', undefined, undefined, {})).toThrow(
      'Tray store domain is required',
    )
  })

  it('exchangeCode (no inputs collected) refuses rather than exchanging with no host', async () => {
    await expect(adapter.exchangeCode('code-1', CONFIG.redirectUri)).rejects.toThrow(
      /requires a store domain/,
    )
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('exchanges the code on the derived {storeDomain}/web_api address', async () => {
    const creds = await adapter.exchangeCodeWithInputs('code-1', CONFIG.redirectUri, {
      storeDomain: 'minhaloja.commercesuite.com.br',
    })
    expect(postSpy).toHaveBeenCalledTimes(1)
    const [url, body, config] = postSpy.mock.calls[0]!
    expect(url).toBe('https://minhaloja.commercesuite.com.br/web_api/auth')
    expect(String(body)).toContain('consumer_key=consumer-key-123')
    expect(String(body)).toContain('consumer_secret=consumer-secret-abc')
    expect(String(body)).toContain('code=code-1')
    expect((config as { headers?: Record<string, string> })?.headers?.['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )

    expect(creds.accessToken).toBe('access-tok')
    expect(creds.refreshToken).toBe('refresh-tok')
    expect(creds.expiresAt).toEqual(new Date('2026-03-01T00:00:00.000Z'))
    expect(creds.extra).toMatchObject({
      apiHost: 'https://minhaloja.commercesuite.com.br/web_api',
      storeDomain: 'minhaloja.commercesuite.com.br',
      storeId: '391250',
    })
  })

  it('stores whatever api_host Tray returns, even when it differs from the derived address', async () => {
    postSpy.mockResolvedValueOnce(
      tokenResponse({ api_host: 'https://cluster-7.trayhosting.com.br/web_api' }),
    )
    const creds = await adapter.exchangeCodeWithInputs('code-1', CONFIG.redirectUri, {
      storeDomain: 'minhaloja.commercesuite.com.br',
    })
    expect(creds.extra?.['apiHost']).toBe('https://cluster-7.trayhosting.com.br/web_api')
  })

  it('rejects a blank store domain before any request', async () => {
    await expect(
      adapter.exchangeCodeWithInputs('code-1', CONFIG.redirectUri, { storeDomain: '' }),
    ).rejects.toThrow('Tray store domain is required')
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('refuses a store domain that resolves to a private address before sending the consumer secret', async () => {
    setDnsResolver(async () => [{ address: '10.0.0.5' }])
    await expect(
      adapter.exchangeCodeWithInputs('code-1', CONFIG.redirectUri, {
        storeDomain: 'internal.example',
      }),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('rejects a non-https `api_host` Tray hands back, even though the request already succeeded', async () => {
    postSpy.mockResolvedValueOnce(
      tokenResponse({ api_host: 'http://minhaloja.commercesuite.com.br/web_api' }),
    )
    await expect(
      adapter.exchangeCodeWithInputs('code-1', CONFIG.redirectUri, {
        storeDomain: 'minhaloja.commercesuite.com.br',
      }),
    ).rejects.toThrow('must use https://')
  })

  it('rejects a private-address `api_host` Tray hands back', async () => {
    postSpy.mockResolvedValueOnce(tokenResponse({ api_host: 'https://internal-only.example/web_api' }))
    setDnsResolver(async (host) =>
      host === 'internal-only.example' ? [{ address: '127.0.0.1' }] : PUBLIC(),
    )
    await expect(
      adapter.exchangeCodeWithInputs('code-1', CONFIG.redirectUri, {
        storeDomain: 'minhaloja.commercesuite.com.br',
      }),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it('refreshes via GET {api_host}/auth?refresh_token=..., re-validating the stored host first', async () => {
    const creds = await adapter.refreshCredentials({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      extra: { apiHost: 'https://minhaloja.commercesuite.com.br/web_api', storeDomain: 'minhaloja.commercesuite.com.br' },
    })
    expect(getSpy).toHaveBeenCalledTimes(1)
    const [url, config] = getSpy.mock.calls[0]!
    expect(url).toBe('https://minhaloja.commercesuite.com.br/web_api/auth')
    expect((config as { params?: Record<string, string> })?.params).toEqual({
      refresh_token: 'old-refresh',
    })
    expect(creds.accessToken).toBe('access-tok')
    expect(creds.refreshToken).toBe('refresh-tok')
    expect(creds.extra?.['storeDomain']).toBe('minhaloja.commercesuite.com.br')
  })

  it('returns the credentials unchanged when there is nothing to refresh with', async () => {
    const creds = { accessToken: 'only-access', extra: {} }
    await expect(adapter.refreshCredentials(creds)).resolves.toBe(creds)
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('re-checks the stored host on refresh before sending the secret again', async () => {
    setDnsResolver(async () => [{ address: '169.254.169.254' }])
    await expect(
      adapter.refreshCredentials({
        accessToken: 'old',
        refreshToken: 'old-refresh',
        extra: { apiHost: 'https://minhaloja.commercesuite.com.br/web_api' },
      }),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(getSpy).not.toHaveBeenCalled()
  })
})
