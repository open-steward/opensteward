/**
 * GOFRUGAL is on-premises: every merchant's RetailEasy WebReporter service
 * lives on its own address, and the client needs an API key AND that
 * address. These tests pin the form to what GofrugalClient reads, and pin
 * the WebReporter URL to https + a public address by default (the API key
 * is sent to it on every request) — with an explicit opt-out for LAN
 * deployments via `OST_ALLOW_PRIVATE_HOSTS=1`.
 *
 * GOFRUGAL also reports no currency of its own — the form collects one ISO
 * 4217 code per connection so the adapter never has to assume a market.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { GofrugalAdapter } from '../../../../../../src/verticals/ecommerce/adapters/gofrugal/index'

const VALID = {
  baseUrl: 'https://retaileasy.example.com',
  apiKey: 'test-api-key-12345',
  currency: 'INR',
}

describe('GOFRUGAL Connect Link form — per-merchant WebReporter URL', () => {
  let adapter: GofrugalAdapter

  beforeEach(() => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    adapter = new GofrugalAdapter()
  })

  afterEach(() => {
    setDnsResolver(undefined)
    vi.unstubAllEnvs()
  })

  it('declares baseUrl, apiKey and currency, all required, apiKey masked', () => {
    const fields = adapter.credentialFields!()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'baseUrl', 'currency'])
    expect(byName['apiKey']!.type).toBe('password')
    expect(byName['baseUrl']!.type).toBe('url')
    expect(byName['currency']!.type).toBe('text')
    for (const f of fields) {
      expect(f.required).toBe(true)
      expect(f.helpText).toBeTruthy()
    }
  })

  it('rejects a blank apiKey', async () => {
    await expect(adapter.exchangeCredentials!({ ...VALID, apiKey: '  ' })).rejects.toThrow(
      /API key is required/,
    )
  })

  it('rejects a blank baseUrl', async () => {
    await expect(adapter.exchangeCredentials!({ ...VALID, baseUrl: '  ' })).rejects.toThrow(
      /WebReporter base URL is required/,
    )
  })

  it('rejects a blank currency', async () => {
    await expect(adapter.exchangeCredentials!({ ...VALID, currency: '  ' })).rejects.toThrow(
      /Currency is required/,
    )
  })

  it('rejects a currency that is not a 3-letter ISO 4217 code', async () => {
    await expect(adapter.exchangeCredentials!({ ...VALID, currency: 'Rupees' })).rejects.toThrow(
      /3-letter ISO 4217 code/,
    )
    await expect(adapter.exchangeCredentials!({ ...VALID, currency: 'IN' })).rejects.toThrow(
      /3-letter ISO 4217 code/,
    )
  })

  it('uppercases a lowercase currency code rather than rejecting it', async () => {
    const creds = await adapter.exchangeCredentials!({ ...VALID, currency: 'inr' })
    expect(creds.extra?.['currency']).toBe('INR')
  })

  it('accepts a non-Indian currency — GOFRUGAL is not India-only', async () => {
    const creds = await adapter.exchangeCredentials!({ ...VALID, currency: 'AED' })
    expect(creds.extra?.['currency']).toBe('AED')
  })

  it('rejects a non-https base URL', async () => {
    await expect(
      adapter.exchangeCredentials!({ ...VALID, baseUrl: 'http://retaileasy.example.com' }),
    ).rejects.toThrow(/must use https:\/\//)
  })

  it('rejects a URL carrying a username or password', async () => {
    await expect(
      adapter.exchangeCredentials!({ ...VALID, baseUrl: 'https://admin:pw@retaileasy.example.com' }),
    ).rejects.toThrow(/must not contain a username or password/)
  })

  it('rejects a private IP literal by default', async () => {
    await expect(
      adapter.exchangeCredentials!({ ...VALID, baseUrl: 'https://10.0.0.5' }),
    ).rejects.toThrow(/must be a public address.*10\.0\.0\.5/)
  })

  it('rejects a hostname that resolves to a private/LAN address by default', async () => {
    setDnsResolver(async () => [{ address: '192.168.1.50' }])
    await expect(
      adapter.exchangeCredentials!({ ...VALID, baseUrl: 'https://retaileasy.internal.example' }),
    ).rejects.toThrow(/must be a public address.*retaileasy\.internal\.example/)
  })

  it('allows a private/LAN address when OST_ALLOW_PRIVATE_HOSTS=1', async () => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '1')
    setDnsResolver(async () => [{ address: '192.168.1.50' }])
    await expect(
      adapter.exchangeCredentials!({ ...VALID, baseUrl: 'https://retaileasy.internal.example' }),
    ).resolves.toBeTruthy()
  })

  it('normalises the base URL to the canonical /WebReporter/api/v1 path, stripping it if already present', async () => {
    const withoutSuffix = await adapter.exchangeCredentials!({
      ...VALID,
      baseUrl: 'RetailEasy.Example.com/store/?x=1',
    })
    expect(withoutSuffix.extra?.['baseUrl']).toBe('https://retaileasy.example.com/store/WebReporter/api/v1')

    const withSuffix = await adapter.exchangeCredentials!({
      ...VALID,
      baseUrl: 'https://retaileasy.example.com/WebReporter/api/v1/',
    })
    expect(withSuffix.extra?.['baseUrl']).toBe('https://retaileasy.example.com/WebReporter/api/v1')
  })

  it('returns credentials in the shape GofrugalClient reads', async () => {
    const creds = await adapter.exchangeCredentials!({
      baseUrl: VALID.baseUrl,
      apiKey: ` ${VALID.apiKey} `,
      currency: VALID.currency,
    })
    expect(creds).toEqual({
      accessToken: VALID.apiKey,
      extra: {
        apiKey: VALID.apiKey,
        baseUrl: 'https://retaileasy.example.com/WebReporter/api/v1',
        currency: 'INR',
      },
    })
  })

  it('builds the client base URL, X-Auth-Token header and currency from those credentials', async () => {
    const creds = await adapter.exchangeCredentials!(VALID)
    const client = new (
      await import('../../../../../../src/verticals/ecommerce/adapters/gofrugal/client.js')
    ).GofrugalClient(creds)
    const defaults = (client as unknown as { http: { defaults: Record<string, unknown> } }).http
      .defaults
    expect(defaults['baseURL']).toBe('https://retaileasy.example.com/WebReporter/api/v1')
    expect((defaults['headers'] as Record<string, unknown>)['X-Auth-Token']).toBe(VALID.apiKey)
    expect(client.currency).toBe('INR')
  })
})
