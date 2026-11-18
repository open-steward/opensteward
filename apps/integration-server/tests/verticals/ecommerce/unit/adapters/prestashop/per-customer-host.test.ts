/**
 * PrestaShop is self-hosted: the Webservice lives at `{store}/api` and the
 * client needs the webservice key AND the store URL. The Connect Link form
 * used to collect a single `apiKey` and never the store, so every linked
 * connection threw on the missing `site`. The key is sent to the store URL
 * on every request: https + public address only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { PrestaShopAdapter } from '../../../../../../src/verticals/ecommerce/adapters/prestashop/index'

const VALID = {
  apiKey: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
  site: 'https://shop.example.com',
}

describe('PrestaShop Connect Link form — per-customer store URL', () => {
  let adapter: PrestaShopAdapter

  beforeEach(() => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    adapter = new PrestaShopAdapter()
  })

  afterEach(() => {
    setDnsResolver(undefined)
    vi.unstubAllEnvs()
  })

  it('declares every value the client reads, with the key masked and the site as a URL', () => {
    const fields = adapter.credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'site'])
    expect(byName['apiKey']!.type).toBe('password')
    expect(byName['site']!.type).toBe('url')
    for (const f of fields) {
      expect(f.required).toBe(true)
      expect(f.helpText).toBeTruthy()
    }
  })

  it.each([
    ['apiKey', /Webservice key is required/],
    ['site', /Store URL is required/],
  ])('rejects a blank %s', async (field, message) => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, [field]: '' }),
    ).rejects.toThrow(message)
  })

  it('rejects a non-https store URL', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, site: 'http://shop.example.com' }),
    ).rejects.toThrow(/Store URL must use https:\/\//)
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, site: 'https://127.0.0.1:8443' }),
    ).rejects.toThrow(/Store URL must be a public address.*127\.0\.0\.1/)
  })

  it('rejects a hostname that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '10.1.2.3' }])
    await expect(
      adapter.exchangeCredentials({ ...VALID, site: 'https://shop.internal.example' }),
    ).rejects.toThrow(/Store URL must be a public address.*shop\.internal\.example/)
  })

  it('returns normalised values in the shape the client reads', async () => {
    const creds = await adapter.exchangeCredentials({
      apiKey: ` ${VALID.apiKey} `,
      site: 'shop.example.com/fr/',
    })
    expect(creds).toEqual({
      accessToken: VALID.apiKey,
      extra: { site: 'https://shop.example.com/fr' },
    })
  })

  it('builds the client base URL and auth header from those credentials', async () => {
    const creds = await adapter.exchangeCredentials(VALID)
    const client = adapter['clientFor'](creds)
    const defaults = client['http'].defaults
    expect(defaults.baseURL).toBe('https://shop.example.com/api')
    const expected = Buffer.from(`${VALID.apiKey}:`).toString('base64')
    expect(defaults.headers['Authorization']).toBe(`Basic ${expected}`)
  })
})
