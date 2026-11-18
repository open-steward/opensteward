import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawEtsyReceipt,
} from '../../../../../../../src/verticals/ecommerce/adapters/etsy/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeReceipt(overrides: Partial<RawEtsyReceipt> = {}): RawEtsyReceipt {
  return {
    receipt_id: 2345678901,
    buyer_email: 'buyer@example.com',
    buyer_user_id: 42,
    name: 'Alice Shopper',
    status: 'paid',
    is_paid: true,
    is_shipped: false,
    grandtotal: { amount: 3498, divisor: 100, currency_code: 'USD' },
    subtotal: { amount: 2998, divisor: 100, currency_code: 'USD' },
    total_tax_cost: { amount: 0, divisor: 100, currency_code: 'USD' },
    total_shipping_cost: { amount: 500, divisor: 100, currency_code: 'USD' },
    discount_amt: { amount: 0, divisor: 100, currency_code: 'USD' },
    transactions: [
      {
        transaction_id: 3001,
        listing_id: 1234567890,
        title: 'Handmade Ceramic Mug',
        quantity: 2,
        price: { amount: 1499, divisor: 100, currency_code: 'USD' },
        sku: 'MUG-BLUE-LG',
      },
    ],
    created_timestamp: 1714564800, // 2024-05-01T12:00:00Z
    updated_timestamp: 1714568400, // 2024-05-01T13:00:00Z
    ...overrides,
  }
}

describe('transformOrder (Etsy)', () => {
  it('maps core fields and uses receipt_id as the canonical id', () => {
    const result = transformOrder(makeReceipt())
    expect(result.id).toBe('2345678901')
    expect(result.orderNumber).toBe('2345678901')
    expect(result.name).toBe('Alice Shopper')
    expect(result.email).toBe('buyer@example.com')
    expect(result.customerId).toBe('42')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 3498, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 2998, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'USD' })
  })

  it('hydrates line items from transactions', () => {
    const result = transformOrder(makeReceipt())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('3001')
    expect(li.productId).toBe('1234567890')
    expect(li.title).toBe('Handmade Ceramic Mug')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 1499, currency: 'USD' })
    expect(li.sku).toBe('MUG-BLUE-LG')
  })

  it('maps financial and fulfillment statuses', () => {
    const paid = makeReceipt({ is_paid: true, is_shipped: false })
    expect(transformOrder(paid).financialStatus).toBe('PAID')
    expect(transformOrder(paid).fulfillmentStatus).toBe('UNFULFILLED')

    const shipped = makeReceipt({ is_paid: true, is_shipped: true, status: 'completed' })
    expect(transformOrder(shipped).financialStatus).toBe('PAID')
    expect(transformOrder(shipped).fulfillmentStatus).toBe('FULFILLED')
  })

  it('produces a payload that satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeReceipt()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })
})

describe('mapFinancialStatus (Etsy)', () => {
  it('maps all known states', () => {
    expect(mapFinancialStatus({ receipt_id: 1, is_paid: true } as RawEtsyReceipt)).toBe('PAID')
    expect(mapFinancialStatus({ receipt_id: 1, status: 'paid' } as RawEtsyReceipt)).toBe('PAID')
    expect(mapFinancialStatus({ receipt_id: 1, status: 'completed' } as RawEtsyReceipt)).toBe('PAID')
    expect(mapFinancialStatus({ receipt_id: 1, status: 'open' } as RawEtsyReceipt)).toBe('PENDING')
    expect(mapFinancialStatus({ receipt_id: 1 } as RawEtsyReceipt)).toBeUndefined()
  })
})

describe('mapFulfillmentStatus (Etsy)', () => {
  it('maps all known states', () => {
    expect(mapFulfillmentStatus({ receipt_id: 1, is_shipped: true } as RawEtsyReceipt)).toBe('FULFILLED')
    expect(mapFulfillmentStatus({ receipt_id: 1, status: 'completed' } as RawEtsyReceipt)).toBe('FULFILLED')
    expect(mapFulfillmentStatus({ receipt_id: 1 } as RawEtsyReceipt)).toBe('UNFULFILLED')
  })
})
