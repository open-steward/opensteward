/**
 * Ozon connects with a per-seller key pair, not OAuth.
 *
 * Every Seller API request carries two headers, `Client-Id` and `Api-Key`,
 * which the seller mints in the seller dashboard (Settings → API keys).
 * Confirmed from the API itself on 2026-09-13 — an unauthenticated request to
 * `https://api-seller.ozon.ru/v3/posting/fbs/list` answers
 * `401 {"code":16,"message":"Client-Id and Api-Key headers are required"}` —
 * and from the "Auth" section of Ozon's official spec:
 *   https://docs.ozon.ru/api/seller/
 *   https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json
 *
 * The Connect page therefore renders `credentialFields()` and calls
 * `exchangeCredentials()`; the returned Credentials are persisted as-is.
 */
import { describe, it, expect } from 'vitest'
import { OzonAdapter } from '../../../../../../src/verticals/ecommerce/adapters/ozon/index'

describe('ozon credential form', () => {
  it('asks for Client ID and API key, masking the key', () => {
    const fields = new OzonAdapter().credentialFields()
    expect(fields.map((f) => [f.name, f.type, f.required])).toEqual([
      ['clientId', 'text', true],
      ['apiKey', 'password', true],
    ])
  })

  it('stores the API key as the access token and the Client ID in extra', async () => {
    const creds = await new OzonAdapter().exchangeCredentials({ clientId: ' 1943980 ', apiKey: ' 9a1b-key ' })
    expect(creds).toEqual({ accessToken: '9a1b-key', extra: { clientId: '1943980' } })
  })

  it('refuses an incomplete pair', async () => {
    const adapter = new OzonAdapter()
    await expect(adapter.exchangeCredentials({ clientId: '1943980', apiKey: '' })).rejects.toThrow(
      /Client ID and API key are both required/,
    )
    await expect(adapter.exchangeCredentials({ clientId: '', apiKey: 'k' })).rejects.toThrow(
      /Client ID and API key are both required/,
    )
  })

  it('has no OAuth flow to start or complete', async () => {
    const adapter = new OzonAdapter()
    expect(() => adapter.getAuthUrl('state')).toThrow(/Ozon does not use OAuth/)
    await expect(adapter.exchangeCode('code', 'https://example.test/cb')).rejects.toThrow(/Ozon does not use OAuth/)
  })

  it('treats keys as non-expiring: refresh returns the same credentials', async () => {
    const creds = { accessToken: 'k', extra: { clientId: '1' } }
    await expect(new OzonAdapter().refreshCredentials(creds)).resolves.toBe(creds)
  })
})
