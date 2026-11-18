/**
 * Newegg authenticates with THREE per-seller values
 * (https://developer.newegg.com/newegg_marketplace_api/newegg_marketplace_api_authentication/):
 *   Authorization: {API key}   SecretKey: {secret key}   ?sellerid={seller id}
 * and the base path depends on which marketplace the seller is on
 * (US `/marketplace/`, Canada `/marketplace/can/`, B2B `/marketplace/b2b/`).
 * A single "API key" field collects none of that correctly.
 */
import { describe, expect, it } from 'vitest'
import { NeweggAdapter } from '../../../../../../src/verticals/ecommerce/adapters/newegg'
import { NeweggClient } from '../../../../../../src/verticals/ecommerce/adapters/newegg/client'

function baseUrlOf(client: NeweggClient): string | undefined {
  return (client as unknown as { http: { defaults: { baseURL?: string } } }).http.defaults.baseURL
}
function headersOf(client: NeweggClient): Record<string, string> {
  return (client as unknown as { requestHeaders(): Record<string, string> }).requestHeaders()
}

const VALID = { sellerId: 'A001', apiKey: 'KEY-123', secretKey: 'SECRET-456', marketplace: 'us' }

describe('Newegg Connect Link form', () => {
  const adapter = new NeweggAdapter()

  it('declares seller ID, API key, secret key and marketplace', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(byName['sellerId']).toMatchObject({ type: 'text', required: true })
    expect(byName['apiKey']).toMatchObject({ type: 'password', required: true })
    expect(byName['secretKey']).toMatchObject({ type: 'password', required: true })
    expect(byName['marketplace']).toMatchObject({ type: 'select', required: true })
    expect(byName['marketplace']?.options?.map((o) => o.value)).toEqual(['us', 'can', 'b2b'])
    for (const name of ['sellerId', 'apiKey', 'secretKey']) {
      expect(byName[name]?.helpText, name).toBeTruthy()
    }
  })

  it('rejects a blank seller ID', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, sellerId: ' ' })).rejects.toThrow(
      'Seller ID is required.',
    )
  })

  it('rejects a blank API key', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, apiKey: '' })).rejects.toThrow(
      'API key is required.',
    )
  })

  it('rejects a blank secret key', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, secretKey: '' })).rejects.toThrow(
      'Secret key is required.',
    )
  })

  it('rejects a blank marketplace', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, marketplace: '' })).rejects.toThrow(
      'Marketplace is required.',
    )
  })

  it('rejects a marketplace outside the closed set', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, marketplace: 'evil.example' }),
    ).rejects.toThrow('Marketplace must be one of: us, can, b2b.')
  })

  it('rejects a seller ID that could alter the request URL', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, sellerId: 'A001&sellerid=B002' }),
    ).rejects.toThrow('Seller ID may only contain letters and digits.')
  })

  it('returns trimmed values in the shape the client reads', async () => {
    await expect(
      adapter.exchangeCredentials({
        sellerId: ' A001 ',
        apiKey: ' KEY-123 ',
        secretKey: ' SECRET-456 ',
        marketplace: 'can',
      }),
    ).resolves.toEqual({
      accessToken: 'SECRET-456',
      extra: { sellerId: 'A001', apiKey: 'KEY-123', marketplace: 'can' },
    })
  })

  it('sends the API key as Authorization and the secret key as SecretKey', async () => {
    const client = new NeweggClient(await adapter.exchangeCredentials(VALID))
    expect(headersOf(client)).toEqual({ Authorization: 'KEY-123', SecretKey: 'SECRET-456' })
  })

  it.each([
    ['us', 'https://api.newegg.com/marketplace'],
    ['can', 'https://api.newegg.com/marketplace/can'],
    ['b2b', 'https://api.newegg.com/marketplace/b2b'],
  ])('uses the %s marketplace base path', async (marketplace, expected) => {
    const client = new NeweggClient(await adapter.exchangeCredentials({ ...VALID, marketplace }))
    expect(baseUrlOf(client)).toBe(expected)
  })

  it('refuses to build a client without the API key rather than sending the seller ID', () => {
    expect(
      () => new NeweggClient({ accessToken: 'SECRET-456', extra: { sellerId: 'A001' } }),
    ).toThrow('Newegg credentials are missing the API key')
  })
})
