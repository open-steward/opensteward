/**
 * WooCommerce is self-hosted: every store lives on its own domain, and the
 * client needs a consumer key, a consumer secret AND that domain. The Connect
 * Link form used to collect a single `apiKey`, so no connection made through
 * it could ever reach a store. These tests pin the form to what the client
 * reads, and pin the store URL to https + a public address because the
 * consumer secret is sent to it on every request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { WooCommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/woocommerce/index'

const VALID = {
  consumerKey: 'ck_0123456789abcdef',
  consumerSecret: 'cs_0123456789abcdef',
  site: 'https://shop.example.com',
}

describe('WooCommerce Connect Link form — per-customer store URL', () => {
  let adapter: WooCommerceAdapter

  beforeEach(() => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    adapter = new WooCommerceAdapter()
  })

  afterEach(() => {
    setDnsResolver(undefined)
    vi.unstubAllEnvs()
  })

  it('declares every value the client reads, with secrets masked and the site as a URL', () => {
    const fields = adapter.credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['consumerKey', 'consumerSecret', 'site'])
    expect(byName['consumerKey']!.type).toBe('password')
    expect(byName['consumerSecret']!.type).toBe('password')
    expect(byName['site']!.type).toBe('url')
    for (const f of fields) {
      expect(f.required).toBe(true)
      expect(f.helpText).toBeTruthy()
    }
  })

  it.each([
    ['consumerKey', /Consumer key is required/],
    ['consumerSecret', /Consumer secret is required/],
    ['site', /Store URL is required/],
  ])('rejects a blank %s', async (field, message) => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, [field]: '   ' }),
    ).rejects.toThrow(message)
  })

  it('rejects keys pasted into the wrong boxes', async () => {
    await expect(
      adapter.exchangeCredentials({
        ...VALID,
        consumerKey: VALID.consumerSecret,
        consumerSecret: VALID.consumerKey,
      }),
    ).rejects.toThrow(/Consumer key should start with "ck_"/)
  })

  it('rejects a non-https store URL', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, site: 'http://shop.example.com' }),
    ).rejects.toThrow(/Store URL must use https:\/\//)
  })

  it('rejects a URL carrying a username or password', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, site: 'https://admin:pw@shop.example.com' }),
    ).rejects.toThrow(/Store URL must not contain a username or password/)
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, site: 'https://10.0.0.5' }),
    ).rejects.toThrow(/Store URL must be a public address.*10\.0\.0\.5/)
  })

  it('rejects a hostname that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '127.0.0.1' }])
    await expect(
      adapter.exchangeCredentials({ ...VALID, site: 'https://shop.internal.example' }),
    ).rejects.toThrow(/Store URL must be a public address.*shop\.internal\.example/)
  })

  it('returns normalised values in the shape the client reads', async () => {
    const creds = await adapter.exchangeCredentials({
      consumerKey: `  ${VALID.consumerKey} `,
      consumerSecret: ` ${VALID.consumerSecret}`,
      site: 'Shop.Example.com/store/?utm=1#x',
    })
    expect(creds).toEqual({
      accessToken: VALID.consumerKey,
      extra: {
        consumerKey: VALID.consumerKey,
        consumerSecret: VALID.consumerSecret,
        site: 'https://shop.example.com/store',
      },
    })
  })

  it('builds the client base URL and auth header from those credentials', async () => {
    const creds = await adapter.exchangeCredentials(VALID)
    const client = adapter['clientFor'](creds)
    const defaults = client['http'].defaults
    expect(defaults.baseURL).toBe('https://shop.example.com/wp-json/wc/v3')
    const expected = Buffer.from(`${VALID.consumerKey}:${VALID.consumerSecret}`).toString('base64')
    expect(defaults.headers['Authorization']).toBe(`Basic ${expected}`)
  })
})
