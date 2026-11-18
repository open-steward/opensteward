/**
 * Medusa is self-hosted: the Admin API lives at `{backend}/admin` and the
 * client needs the secret API key AND the backend URL. The Connect Link form
 * used to collect a single `apiKey` and never the backend, so every linked
 * connection threw on the missing `host`. The key is sent to that URL on
 * every request: https + public address only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { MedusaAdapter } from '../../../../../../src/verticals/ecommerce/adapters/medusa/index'

const VALID = {
  apiKey: 'sk_0123456789abcdef',
  host: 'https://api.shop.example.com',
}

describe('Medusa Connect Link form — per-customer backend URL', () => {
  let adapter: MedusaAdapter

  beforeEach(() => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    adapter = new MedusaAdapter()
  })

  afterEach(() => {
    setDnsResolver(undefined)
    vi.unstubAllEnvs()
  })

  it('declares every value the client reads, with the key masked and the host as a URL', () => {
    const fields = adapter.credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'host'])
    expect(byName['apiKey']!.type).toBe('password')
    expect(byName['host']!.type).toBe('url')
    for (const f of fields) {
      expect(f.required).toBe(true)
      expect(f.helpText).toBeTruthy()
    }
  })

  it.each([
    ['apiKey', /Secret API key is required/],
    ['host', /Medusa backend URL is required/],
  ])('rejects a blank %s', async (field, message) => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, [field]: '' }),
    ).rejects.toThrow(message)
  })

  it('rejects a non-https backend URL', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, host: 'http://api.shop.example.com' }),
    ).rejects.toThrow(/Medusa backend URL must use https:\/\//)
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, host: 'https://127.0.0.1:9000' }),
    ).rejects.toThrow(/Medusa backend URL must be a public address.*127\.0\.0\.1/)
  })

  it('rejects a hostname that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '10.0.0.8' }])
    await expect(
      adapter.exchangeCredentials({ ...VALID, host: 'https://medusa.internal.example' }),
    ).rejects.toThrow(/Medusa backend URL must be a public address.*medusa\.internal\.example/)
  })

  it.each([
    'https://api.shop.example.com/',
    'https://api.shop.example.com/app',
    'https://api.shop.example.com/admin/',
  ])('normalises %s to the backend origin in the shape the client reads', async (host) => {
    const creds = await adapter.exchangeCredentials({ apiKey: ` ${VALID.apiKey} `, host })
    expect(creds).toEqual({
      accessToken: VALID.apiKey,
      extra: { host: 'https://api.shop.example.com' },
    })
  })

  it('builds the client base URL from those credentials', async () => {
    const creds = await adapter.exchangeCredentials(VALID)
    const client = adapter['clientFor'](creds)
    expect(client['http'].defaults.baseURL).toBe('https://api.shop.example.com/admin')
  })
})
