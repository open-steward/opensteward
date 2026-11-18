/**
 * Ordergroove credential exchange: a static API key, no code exchange.
 *
 * "Authentication via an x-api-key header that uses one of 10 keys
 * available for your store" —
 * https://developer.ordergroove.com/reference/authentication
 */
import { describe, it, expect } from 'vitest'
import { OrdergrooveAdapter } from '../../../../../../src/verticals/ecommerce/adapters/ordergroove/index'

describe('OrdergrooveAdapter.exchangeCredentials', () => {
  it('stores the API key as accessToken', async () => {
    const adapter = new OrdergrooveAdapter()
    const creds = await adapter.exchangeCredentials!({ apiKey: 'ogk_live_abc123' })
    expect(creds.accessToken).toBe('ogk_live_abc123')
  })

  it('requires an API key', async () => {
    const adapter = new OrdergrooveAdapter()
    await expect(adapter.exchangeCredentials!({ apiKey: '' })).rejects.toThrow(/required/i)
  })

  it('carries an optional merchantId into extra for createCustomer', async () => {
    const adapter = new OrdergrooveAdapter()
    const creds = await adapter.exchangeCredentials!({
      apiKey: 'ogk_live_abc123',
      merchantId: 'merch_1',
    })
    expect(creds.extra).toMatchObject({ merchantId: 'merch_1' })
  })

  it('selects the staging environment when requested', async () => {
    const adapter = new OrdergrooveAdapter()
    const creds = await adapter.exchangeCredentials!({
      apiKey: 'ogk_live_abc123',
      environment: 'true',
    })
    expect(creds.extra).toMatchObject({ sandbox: true })
  })

  it('defaults to production when no environment is chosen', async () => {
    const adapter = new OrdergrooveAdapter()
    const creds = await adapter.exchangeCredentials!({ apiKey: 'ogk_live_abc123' })
    expect(creds.extra?.sandbox).toBeUndefined()
  })
})
