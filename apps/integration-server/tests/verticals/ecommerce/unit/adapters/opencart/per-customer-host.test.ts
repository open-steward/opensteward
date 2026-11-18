/**
 * OpenCart is self-hosted, and this adapter talks to the "REST Admin API"
 * extension (`index.php?route=rest/...`, `X-Oc-Restadmin-Id` header), so the
 * client needs both the extension's secret key and the store URL. The
 * Connect Link form used to collect a single `apiKey` and never the store,
 * so every linked connection threw on the missing `site`. The store URL
 * receives the key on every request: https + public address only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { OpenCartAdapter } from '../../../../../../src/verticals/ecommerce/adapters/opencart/index'

const VALID = {
  apiKey: 'restadmin-secret-key',
  site: 'https://shop.example.com',
}

describe('OpenCart Connect Link form — per-customer store URL', () => {
  let adapter: OpenCartAdapter

  beforeEach(() => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    adapter = new OpenCartAdapter()
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
    ['apiKey', /REST Admin API secret key is required/],
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
      adapter.exchangeCredentials({ ...VALID, site: 'https://192.168.1.20' }),
    ).rejects.toThrow(/Store URL must be a public address.*192\.168\.1\.20/)
  })

  it('rejects a hostname that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '169.254.169.254' }])
    await expect(
      adapter.exchangeCredentials({ ...VALID, site: 'https://metadata.example' }),
    ).rejects.toThrow(/Store URL must be a public address.*metadata\.example/)
  })

  it('returns normalised values in the shape the client reads', async () => {
    const creds = await adapter.exchangeCredentials({
      apiKey: ` ${VALID.apiKey} `,
      site: 'https://Shop.Example.com/index.php?route=common/home',
    })
    expect(creds).toEqual({
      accessToken: VALID.apiKey,
      extra: { apiKey: VALID.apiKey, site: 'https://shop.example.com' },
    })
  })

  it('builds the client base URL and auth header from those credentials', async () => {
    const creds = await adapter.exchangeCredentials(VALID)
    const client = adapter['clientFor'](creds)
    const defaults = client['http'].defaults
    expect(defaults.baseURL).toBe('https://shop.example.com/index.php?route=rest')
    expect(defaults.headers['X-Oc-Restadmin-Id']).toBe(VALID.apiKey)
  })
})
