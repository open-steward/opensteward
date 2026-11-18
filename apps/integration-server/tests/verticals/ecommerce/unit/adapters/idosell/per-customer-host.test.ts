/**
 * Every IdoSell shop's Admin API lives on the shop's own panel domain
 * (`https://{domain}/api/admin/v8/...` — confirmed on the `servers` block of
 * every reference page's embedded OpenAPI fragment, e.g.
 * https://idosell.readme.io/reference/clientsclientsput). The API key is
 * sent to that domain on every request, so it must be validated the same
 * way WooCommerce's `site` field is: https-only, no embedded credentials,
 * and a public, resolvable host (`assertPublicHost`) — IdoSell's docs do
 * not define a closed set of panel-domain suffixes to confine to instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { IdosellAdapter } from '../../../../../../src/verticals/ecommerce/adapters/idosell/index'

const VALID = {
  apiKey: 'idosell-key-0123456789',
  shopDomain: 'https://client123.idosell.com',
}

describe('IdoSell Connect Link form — per-customer shop domain', () => {
  let adapter: IdosellAdapter

  beforeEach(() => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    adapter = new IdosellAdapter()
  })

  afterEach(() => {
    setDnsResolver(undefined)
    vi.unstubAllEnvs()
  })

  it('declares exactly the two values the client reads', () => {
    const fields = adapter.credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'shopDomain'])
    expect(byName['apiKey']!.type).toBe('password')
    expect(byName['shopDomain']!.type).toBe('url')
    for (const f of fields) {
      expect(f.required).toBe(true)
      expect(f.helpText).toBeTruthy()
    }
  })

  it('rejects a blank API key', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, apiKey: '   ' })).rejects.toThrow(
      /API key is required/,
    )
  })

  it('rejects a blank shop domain', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, shopDomain: '   ' })).rejects.toThrow(
      /Shop domain is required/,
    )
  })

  it('rejects a non-https shop domain', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, shopDomain: 'http://client123.idosell.com' }),
    ).rejects.toThrow(/Shop domain must use https:\/\//)
  })

  it('rejects a domain carrying a username or password', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, shopDomain: 'https://key:secret@client123.idosell.com' }),
    ).rejects.toThrow(/Shop domain must not contain a username or password/)
  })

  it('rejects a private IP literal', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, shopDomain: 'https://10.0.0.5' })).rejects.toThrow(
      /Shop domain must be a public address.*10\.0\.0\.5/,
    )
  })

  it('rejects a hostname that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '127.0.0.1' }])
    await expect(
      adapter.exchangeCredentials({ ...VALID, shopDomain: 'https://panel.internal.example' }),
    ).rejects.toThrow(/Shop domain must be a public address.*panel\.internal\.example/)
  })

  it('returns normalised values in the shape the client reads', async () => {
    const creds = await adapter.exchangeCredentials({
      apiKey: `  ${VALID.apiKey} `,
      shopDomain: 'Client123.IdoSell.com',
    })
    expect(creds).toEqual({
      accessToken: VALID.apiKey,
      extra: { apiKey: VALID.apiKey, shopDomain: 'client123.idosell.com' },
    })
  })

  it('builds the client base URL and X-API-KEY header from those credentials', async () => {
    const creds = await adapter.exchangeCredentials(VALID)
    const client = adapter['client'](creds)
    const defaults = client['http'].defaults
    expect(defaults.baseURL).toBe('https://client123.idosell.com/api/admin/v8')
    expect(defaults.headers['X-API-KEY']).toBe(VALID.apiKey)
  })
})
