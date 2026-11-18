import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawFoxyTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/foxy-io/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawFoxyTransaction> = {}): RawFoxyTransaction {
  return {
    id: 1001,
    display_id: 5001,
    customer_id: 42,
    customer_email: 'lovelace@example.com',
    currency_code: 'USD',
    total_item_price: '100.00',
    total_tax: '8.00',
    total_shipping: '5.99',
    total_order: '113.99',
    status: 'approved',
    transaction_date: '2024-03-01T00:00:00Z',
    date_created: '2024-03-01T00:00:00Z',
    date_modified: '2024-03-01T12:00:00Z',
    _embedded: {
      'fx:items': [
        {
          id: 9001,
          name: 'Blue Widget',
          price: '50.00',
          quantity: 2,
          code: 'BW-001',
          product_id: 777,
        },
      ],
      'fx:shipments': [
        {
          id: 300,
          address1: '1 Dispatch Way',
          city: 'Manchester',
          postal_code: 'M1 1AA',
          country: 'GB',
        },
      ],
      'fx:payments': [{ id: 600 }],
    },
    ...overrides,
  }
}

describe('transformOrder (Foxy.io)', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(typeof result.id).toBe('string')
    expect(result.customerId).toBe('42')
    expect(result.email).toBe('lovelace@example.com')
    expect(result.currency).toBe('USD')
    expect(result.orderNumber).toBe('5001')
    expect(result.name).toBe('#5001')
  })

  it('converts money fields from major to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 11399, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 10000, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 800, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 599, currency: 'USD' })
  })

  it('maps financial status from Foxy status strings', () => {
    expect(transformOrder(makeOrder({ status: 'approved' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ status: 'authorized' })).financialStatus).toBe('AUTHORIZED')
    expect(transformOrder(makeOrder({ status: 'declined' })).financialStatus).toBe('VOIDED')
    expect(transformOrder(makeOrder({ status: 'rejected' })).financialStatus).toBe('VOIDED')
    expect(transformOrder(makeOrder({ status: 'pending' })).financialStatus).toBe('PENDING')
  })

  it('maps line items from embedded fx:items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.title).toBe('Blue Widget')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 5000, currency: 'USD' })
    expect(li.sku).toBe('BW-001')
    expect(li.productId).toBe('777')
  })

  it('maps shippingAddress from first embedded shipment', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.line1).toBe('1 Dispatch Way')
    expect(result.shippingAddress?.country).toBe('GB')
  })

  it('maps transactionIds from embedded payments', () => {
    const result = transformOrder(makeOrder())
    expect(result.transactionIds).toEqual(['600'])
  })

  it('defaults currency to USD when currency_code is absent', () => {
    const result = transformOrder(makeOrder({ currency_code: undefined }))
    expect(result.currency).toBe('USD')
  })

  it('uses raw.id in name when display_id is absent', () => {
    const result = transformOrder(makeOrder({ display_id: null }))
    expect(result.name).toBe('#1001')
    expect(result.orderNumber).toBeUndefined()
  })

  it('returns undefined lineItems when fx:items is empty', () => {
    const result = transformOrder(
      makeOrder({ _embedded: { 'fx:items': [], 'fx:shipments': [], 'fx:payments': [] } }),
    )
    expect(result.lineItems).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
