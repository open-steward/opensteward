/**
 * Doc: https://developers.falabella.com/docs/operate-with-apis — static
 * User ID (email) + API key, no OAuth, keys do not expire.
 */
import { describe, it, expect } from 'vitest'
import { exchangeCode, refreshCredentials } from '../../../../../../src/verticals/ecommerce/adapters/falabella/auth'
import { FalabellaAdapter } from '../../../../../../src/verticals/ecommerce/adapters/falabella/index'

describe('exchangeCode (Falabella)', () => {
  it('throws, directing callers to the credential-form flow', () => {
    expect(() => exchangeCode()).toThrow(/static API key/)
  })
})

describe('refreshCredentials (Falabella)', () => {
  it('is a no-op — Falabella keys are static', async () => {
    const creds = { accessToken: 'k', extra: { userId: 'u', sellerId: 's', country: 'CL' } }
    expect(await refreshCredentials(creds)).toBe(creds)
  })
})

describe('FalabellaAdapter credential form', () => {
  it('declares userId, apiKey, sellerId, and a country select of CL/CO/PE', () => {
    const adapter = new FalabellaAdapter()
    const fields = adapter.credentialFields!()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(byName['userId']?.required).toBe(true)
    expect(byName['apiKey']?.type).toBe('password')
    expect(byName['sellerId']?.required).toBe(true)
    expect(byName['country']?.type).toBe('select')
    expect(byName['country']?.options?.map((o) => o.value).sort()).toEqual(['CL', 'CO', 'PE'])
  })

  it('exchangeCredentials stores the API key as accessToken and keeps userId/sellerId/country', async () => {
    const adapter = new FalabellaAdapter()
    const creds = await adapter.exchangeCredentials!({
      userId: 'seller@example.com',
      apiKey: 'my-api-key',
      sellerId: 'JJJ123',
      country: 'CL',
    })
    expect(creds.accessToken).toBe('my-api-key')
    expect(creds.extra).toEqual({ userId: 'seller@example.com', sellerId: 'JJJ123', country: 'CL' })
  })

  it('rejects Argentina and other unsupported countries', async () => {
    const adapter = new FalabellaAdapter()
    await expect(
      adapter.exchangeCredentials!({ userId: 'u@example.com', apiKey: 'k', sellerId: 's', country: 'AR' }),
    ).rejects.toThrow(/not supported/)
  })

  it('rejects missing required fields', async () => {
    const adapter = new FalabellaAdapter()
    await expect(
      adapter.exchangeCredentials!({ userId: '', apiKey: 'k', sellerId: 's', country: 'CL' }),
    ).rejects.toThrow(/required/)
  })
})
