/**
 * Virto Commerce is self-hosted: every instance lives on its own domain, so
 * the Connect Link form needs the platform URL as well as an API key. The
 * key is sent to that URL on every request (header `api_key`, confirmed via
 * the live demo instance's Swagger security scheme — see
 * `../../../../../src/verticals/ecommerce/adapters/virto-commerce/client.ts`),
 * so the URL is normalised and must be https on a public address, mirroring
 * `woocommerce/connect-form.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { VirtoCommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/virto-commerce/index'

const VALID = {
  platformUrl: 'https://virtostart-demo-admin.govirto.com',
  apiKey: 'test-api-key-0123456789',
}

describe('Virto Commerce Connect Link form — per-customer platform URL', () => {
  let adapter: VirtoCommerceAdapter

  beforeEach(() => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    adapter = new VirtoCommerceAdapter()
  })

  afterEach(() => {
    setDnsResolver(undefined)
    vi.unstubAllEnvs()
  })

  it('declares platformUrl and apiKey, both required, key masked', () => {
    const fields = adapter.credentialFields!()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'platformUrl'])
    expect(byName['platformUrl']!.type).toBe('url')
    expect(byName['apiKey']!.type).toBe('password')
    for (const f of fields) expect(f.required).toBe(true)
  })

  it('rejects a blank apiKey', async () => {
    await expect(
      adapter.exchangeCredentials!({ ...VALID, apiKey: '   ' }),
    ).rejects.toThrow(/API key is required/)
  })

  it('rejects a blank platformUrl', async () => {
    await expect(
      adapter.exchangeCredentials!({ ...VALID, platformUrl: '  ' }),
    ).rejects.toThrow(/Platform URL is required/)
  })

  it('rejects a non-https platform URL', async () => {
    await expect(
      adapter.exchangeCredentials!({ ...VALID, platformUrl: 'http://vc.example.com' }),
    ).rejects.toThrow(/Platform URL must use https:\/\//)
  })

  it('rejects a URL carrying a username or password', async () => {
    await expect(
      adapter.exchangeCredentials!({ ...VALID, platformUrl: 'https://admin:pw@vc.example.com' }),
    ).rejects.toThrow(/Platform URL must not contain a username or password/)
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials!({ ...VALID, platformUrl: 'https://10.0.0.5' }),
    ).rejects.toThrow(/Platform URL must be a public address.*10\.0\.0\.5/)
  })

  it('rejects a hostname that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '127.0.0.1' }])
    await expect(
      adapter.exchangeCredentials!({ ...VALID, platformUrl: 'https://vc.internal.example' }),
    ).rejects.toThrow(/Platform URL must be a public address.*vc\.internal\.example/)
  })

  it('returns normalised values in the shape the client reads', async () => {
    const creds = await adapter.exchangeCredentials!({
      apiKey: `  ${VALID.apiKey} `,
      platformUrl: 'Virtostart-Demo-Admin.govirto.com/?utm=1#x',
    })
    expect(creds).toEqual({
      accessToken: VALID.apiKey,
      extra: { apiKey: VALID.apiKey, platformUrl: 'https://virtostart-demo-admin.govirto.com' },
    })
  })

  it('builds the client base URL and api_key header from those credentials', async () => {
    const creds = await adapter.exchangeCredentials!(VALID)
    const client = adapter['clientFor'](creds)
    const defaults = client['http'].defaults
    expect(defaults.baseURL).toBe(VALID.platformUrl)
    expect(defaults.headers['api_key']).toBe(VALID.apiKey)
  })
})
