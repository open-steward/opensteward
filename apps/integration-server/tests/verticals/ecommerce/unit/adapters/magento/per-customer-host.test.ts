/**
 * Magento / Adobe Commerce is self-hosted: the REST API lives at
 * `{store}/rest/V1` and the client needs a bearer token AND the store URL.
 * The Connect Link form used to collect a single `apiKey` and never the
 * store, so every linked connection threw on the missing `baseUrl`.
 *
 * The form collects an integration access token rather than an admin
 * username/password: Magento 2.4+ enforces two-factor auth on
 * `POST /V1/integration/admin/token`, so a password alone cannot mint a
 * token on a stock install, while integration tokens are the documented
 * server-to-server credential and do not expire (so no refresh is needed).
 * The token is sent to the store URL on every request: https + public only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { MagentoAdapter } from '../../../../../../src/verticals/ecommerce/adapters/magento/index'

const VALID = {
  accessToken: 'h7wybtgltd4ndjqffzsv7rkbgnrkfb0y',
  baseUrl: 'https://store.example.com',
}

describe('Magento Connect Link form — per-customer store URL', () => {
  let adapter: MagentoAdapter

  beforeEach(() => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    adapter = new MagentoAdapter()
  })

  afterEach(() => {
    setDnsResolver(undefined)
    vi.unstubAllEnvs()
  })

  it('declares every value the client reads, with the token masked and the store as a URL', () => {
    const fields = adapter.credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['accessToken', 'baseUrl'])
    expect(byName['accessToken']!.type).toBe('password')
    expect(byName['baseUrl']!.type).toBe('url')
    for (const f of fields) {
      expect(f.required).toBe(true)
      expect(f.helpText).toBeTruthy()
    }
  })

  it.each([
    ['accessToken', /Integration access token is required/],
    ['baseUrl', /Store URL is required/],
  ])('rejects a blank %s', async (field, message) => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, [field]: '' }),
    ).rejects.toThrow(message)
  })

  it('rejects a non-https store URL', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, baseUrl: 'http://store.example.com' }),
    ).rejects.toThrow(/Store URL must use https:\/\//)
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, baseUrl: 'https://172.20.0.4' }),
    ).rejects.toThrow(/Store URL must be a public address.*172\.20\.0\.4/)
  })

  it('rejects a hostname that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: 'fd00::1' }])
    await expect(
      adapter.exchangeCredentials({ ...VALID, baseUrl: 'https://store.internal.example' }),
    ).rejects.toThrow(/Store URL must be a public address.*store\.internal\.example/)
  })

  it('returns normalised values in the shape the client reads, with no expiry', async () => {
    const creds = await adapter.exchangeCredentials({
      accessToken: ` ${VALID.accessToken} `,
      baseUrl: 'https://Store.example.com/rest/V1/',
    })
    expect(creds).toEqual({
      accessToken: VALID.accessToken,
      extra: { baseUrl: 'https://store.example.com' },
    })
  })

  it('builds the client base URL and bearer header from those credentials', async () => {
    const creds = await adapter.exchangeCredentials(VALID)
    const client = adapter['clientFor'](creds)
    const defaults = client['http'].defaults
    expect(defaults.baseURL).toBe('https://store.example.com/rest/V1')
    expect(defaults.headers['Authorization']).toBe(`Bearer ${VALID.accessToken}`)
  })
})
