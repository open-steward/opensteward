/**
 * thirty bees is a self-hosted PrestaShop 1.6 fork: the Webservice lives at
 * `{store}/api` and the client needs the webservice key AND the store base
 * URL. The Connect Link form used to collect a single `apiKey` and never the
 * store, so every linked connection threw on the missing `baseUrl`. The key
 * is sent to that URL on every request: https + public address only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { ThirtyBeesAdapter } from '../../../../../../src/verticals/ecommerce/adapters/thirty-bees/index'

const VALID = {
  apiKey: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
  baseUrl: 'https://shop.example.com',
}

describe('thirty bees Connect Link form — per-customer store URL', () => {
  let adapter: ThirtyBeesAdapter

  beforeEach(() => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    adapter = new ThirtyBeesAdapter()
  })

  afterEach(() => {
    setDnsResolver(undefined)
    vi.unstubAllEnvs()
  })

  it('declares every value the client reads, with the key masked and the store as a URL', () => {
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
    ['apiKey', /Webservice key is required/],
    ['baseUrl', /Store URL is required/],
  ])('rejects a blank %s', async (field, message) => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, [field]: '' }),
    ).rejects.toThrow(message)
  })

  it('rejects a non-https store URL', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, baseUrl: 'http://shop.example.com' }),
    ).rejects.toThrow(/Store URL must use https:\/\//)
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, baseUrl: 'https://[::1]/' }),
    ).rejects.toThrow(/Store URL must be a public address.*::1/)
  })

  it('rejects a hostname that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '93.184.216.34' }, { address: '172.16.0.9' }])
    await expect(
      adapter.exchangeCredentials({ ...VALID, baseUrl: 'https://mixed.example' }),
    ).rejects.toThrow(/Store URL must be a public address.*mixed\.example/)
  })

  it('returns normalised values in the shape the client reads', async () => {
    const creds = await adapter.exchangeCredentials({
      apiKey: ` ${VALID.apiKey} `,
      baseUrl: 'https://SHOP.example.com///',
    })
    expect(creds).toEqual({
      accessToken: VALID.apiKey,
      extra: { baseUrl: 'https://shop.example.com' },
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
