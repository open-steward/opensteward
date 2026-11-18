/**
 * SendOwl Connect Link form.
 *
 * SendOwl has a single fixed host (`api.sendowl.com`) — unlike WooCommerce
 * or InSales there is no customer-supplied store URL to validate, just the
 * API key + secret pair from Settings → Advanced settings → Developer →
 * SendOwl API (https://dashboard.sendowl.com/developers/api/introduction).
 */
import { describe, it, expect } from 'vitest'
import { SendowlAdapter } from '../../../../../../src/verticals/ecommerce/adapters/sendowl/index'

describe('SendOwl Connect Link form', () => {
  const adapter = new SendowlAdapter()

  it('declares apiKey and apiSecret, both required, secret masked', () => {
    const fields = adapter.credentialFields!()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'apiSecret'])
    expect(byName['apiKey']!.required).toBe(true)
    expect(byName['apiSecret']!.required).toBe(true)
    expect(byName['apiSecret']!.type).toBe('password')
  })

  it('rejects a blank API key', async () => {
    await expect(
      adapter.exchangeCredentials!({ apiKey: '  ', apiSecret: 'secret' }),
    ).rejects.toThrow(/API key is required/)
  })

  it('rejects a blank API secret', async () => {
    await expect(
      adapter.exchangeCredentials!({ apiKey: 'key', apiSecret: '   ' }),
    ).rejects.toThrow(/API secret is required/)
  })

  it('returns credentials in the shape the client reads', async () => {
    const creds = await adapter.exchangeCredentials!({
      apiKey: '  test-key ',
      apiSecret: ' test-secret',
    })
    expect(creds).toEqual({
      accessToken: 'test-key',
      extra: { apiKey: 'test-key', apiSecret: 'test-secret' },
    })
  })

  it('builds the client base URL and Basic auth header from those credentials', async () => {
    const creds = await adapter.exchangeCredentials!({ apiKey: 'k', apiSecret: 's' })
    const client = adapter['clientFor'](creds)
    const defaults = client['http'].defaults
    expect(defaults.baseURL).toBe('https://api.sendowl.com')
    expect(defaults.headers['Authorization']).toBe(`Basic ${Buffer.from('k:s').toString('base64')}`)
  })

  it('getAuthUrl points at the dashboard (informational — SendOwl has no OAuth)', () => {
    expect(adapter.getAuthUrl('state')).toContain('dashboard.sendowl.com')
  })

  it('exchangeCode throws because SendOwl has no OAuth code flow', async () => {
    await expect(adapter.exchangeCode('code', 'redirect')).rejects.toThrow(/does not use OAuth/)
  })

  it('refreshCredentials is a no-op (SendOwl API keys do not expire)', async () => {
    const creds = { accessToken: 'k', extra: { apiSecret: 's' } }
    await expect(adapter.refreshCredentials(creds)).resolves.toEqual(creds)
  })
})
