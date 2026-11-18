/**
 * JTL-Shop is self-hosted: the REST API lives at `{shop}/api/v1` and the
 * client needs the API key AND the shop URL. The Connect Link form used to
 * collect a single `apiKey` and never the shop, so every linked connection
 * threw on the missing `baseUrl`. The key is sent to that URL on every
 * request: https + public address only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { JtlShopAdapter } from '../../../../../../src/verticals/ecommerce/adapters/jtl-shop/index'

const VALID = {
  apiKey: 'jtl-api-key-value',
  baseUrl: 'https://shop.example.de',
}

describe('JTL-Shop Connect Link form — per-customer shop URL', () => {
  let adapter: JtlShopAdapter

  beforeEach(() => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    adapter = new JtlShopAdapter()
  })

  afterEach(() => {
    setDnsResolver(undefined)
    vi.unstubAllEnvs()
  })

  it('declares every value the client reads, with the key masked and the shop as a URL', () => {
    const fields = adapter.credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'baseUrl'])
    expect(byName['apiKey']!.type).toBe('password')
    expect(byName['baseUrl']!.type).toBe('url')
    for (const f of fields) {
      expect(f.required).toBe(true)
      expect(f.helpText).toBeTruthy()
    }
  })

  it.each([
    ['apiKey', /API key is required/],
    ['baseUrl', /Shop URL is required/],
  ])('rejects a blank %s', async (field, message) => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, [field]: '' }),
    ).rejects.toThrow(message)
  })

  it('rejects a non-https shop URL', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, baseUrl: 'http://shop.example.de' }),
    ).rejects.toThrow(/Shop URL must use https:\/\//)
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, baseUrl: 'https://100.64.0.1' }),
    ).rejects.toThrow(/Shop URL must be a public address.*100\.64\.0\.1/)
  })

  it('rejects a hostname that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '192.168.0.10' }])
    await expect(
      adapter.exchangeCredentials({ ...VALID, baseUrl: 'https://shop.lan.example' }),
    ).rejects.toThrow(/Shop URL must be a public address.*shop\.lan\.example/)
  })

  it('returns normalised values in the shape the client reads', async () => {
    const creds = await adapter.exchangeCredentials({
      apiKey: ` ${VALID.apiKey} `,
      baseUrl: 'https://shop.example.de/api/v1/',
    })
    expect(creds).toEqual({
      accessToken: VALID.apiKey,
      extra: { baseUrl: 'https://shop.example.de' },
    })
  })

  it('builds the client base URL and auth header from those credentials', async () => {
    const creds = await adapter.exchangeCredentials(VALID)
    const client = adapter['clientFor'](creds)
    expect(client.apiBase).toBe('https://shop.example.de/api/v1')
    expect(client['http'].defaults.headers['x-api-key']).toBe(VALID.apiKey)
  })
})
