import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawNoonOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/noon/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawNoonOrder> = {}): RawNoonOrder {
  return {
    order_id: 'ORD-98765',
    order_number: 'N-1001',
    customer_name: 'Ahmed Al-Rashid',
    customer_email: 'ahmed@example.com',
    customer_phone: '+971501234567',
    created_at: '2024-07-01T09:00:00Z',
    updated_at: '2024-07-01T12:00:00Z',
    status: 'delivered',
    total_amount: 1198,
    subtotal: 1100,
    shipping_fee: 15,
    tax_total: 83,
    discount_total: 50,
    payment_method: 'credit_card',
    currency: 'AED',
    items: [
      {
        order_item_id: 'OI-111',
        sku: 'SKU-BUDS-BLK',
        seller_sku: 'SELLER-BUDS-BLK',
        title: 'Galaxy Buds Pro - Black',
        title_ar: '\u062C\u0627\u0644\u0627\u0643\u0633\u064A \u0628\u0627\u062F\u0632 \u0628\u0631\u0648 - \u0623\u0633\u0648\u062F',
        unit_price: 599,
        quantity: 2,
        tax_amount: 83,
        discount_amount: 50,
        status: 'delivered',
        product_id: 'NP-12345',
      },
    ],
    shipping_address: {
      name: 'Ahmed Al-Rashid',
      line1: '123 Sheikh Zayed Road',
      line2: 'Business Bay',
      city: 'Dubai',
      region: 'Dubai',
      postal_code: '00000',
      country: 'AE',
      phone: '+971501234567',
    },
    billing_address: {
      name: 'Ahmed Al-Rashid',
      line1: '123 Sheikh Zayed Road',
      city: 'Dubai',
      country: 'AE',
    },
    ...overrides,
  }
}

describe('transformOrder (Noon)', () => {
  it('maps core fields and uses order_id as the canonical id', () => {
    const result = transformOrder(makeOrder(), 'AED')
    expect(result.id).toBe('ORD-98765')
    expect(result.orderNumber).toBe('N-1001')
    expect(result.name).toBe('N-1001')
    expect(result.email).toBe('ahmed@example.com')
    expect(result.phone).toBe('+971501234567')
    expect(result.currency).toBe('AED')
    expect(result.totalPrice).toEqual({ amount: 1198, currency: 'AED' })
    expect(result.totalShipping).toEqual({ amount: 15, currency: 'AED' })
    expect(result.totalDiscounts).toEqual({ amount: 50, currency: 'AED' })
    expect(result.subtotalPrice).toEqual({ amount: 1100, currency: 'AED' })
    expect(result.totalTax).toEqual({ amount: 83, currency: 'AED' })
  })

  it('maps delivered status correctly', () => {
    const result = transformOrder(makeOrder(), 'AED')
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('hydrates line items with parsed prices', () => {
    const result = transformOrder(makeOrder(), 'AED')
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('OI-111')
    expect(li.sku).toBe('SELLER-BUDS-BLK')
    expect(li.title).toBe('Galaxy Buds Pro - Black')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 599, currency: 'AED' })
    expect(li.totalDiscount).toEqual({ amount: 50, currency: 'AED' })
  })

  it('maps shipping address with region', () => {
    const result = transformOrder(makeOrder(), 'AED')
    expect(result.shippingAddress).toMatchObject({
      line1: '123 Sheikh Zayed Road',
      line2: 'Business Bay',
      city: 'Dubai',
      region: 'Dubai',
      postalCode: '00000',
      country: 'AE',
    })
  })

  it('sets cancelledAt for cancelled orders', () => {
    const result = transformOrder(
      makeOrder({ status: 'cancelled', updated_at: '2024-07-02T00:00:00Z' }),
      'AED',
    )
    expect(result.cancelledAt).toBe('2024-07-02T00:00:00Z')
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('uses order currency over fallback', () => {
    const result = transformOrder(makeOrder({ currency: 'SAR' }), 'AED')
    expect(result.currency).toBe('SAR')
    expect(result.totalPrice?.currency).toBe('SAR')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder(), 'AED')
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw, 'AED')
    expect(result.metadata).toBe(raw)
  })

  it('handles orders with no line items', () => {
    const result = transformOrder(makeOrder({ items: [] }), 'AED')
    expect(result.lineItems).toBeUndefined()
  })
})

describe('mapFinancialStatus (Noon)', () => {
  it('maps all known statuses', () => {
    expect(mapFinancialStatus('pending')).toBe('PENDING')
    expect(mapFinancialStatus('confirmed')).toBe('PAID')
    expect(mapFinancialStatus('processing')).toBe('PAID')
    expect(mapFinancialStatus('shipped')).toBe('PAID')
    expect(mapFinancialStatus('delivered')).toBe('PAID')
    expect(mapFinancialStatus('returned')).toBe('REFUNDED')
    expect(mapFinancialStatus('cancelled')).toBe('VOIDED')
    expect(mapFinancialStatus('failed')).toBe('VOIDED')
  })

  it('returns undefined for empty or unknown statuses', () => {
    expect(mapFinancialStatus(undefined)).toBeUndefined()
    expect(mapFinancialStatus('unknown_status')).toBeUndefined()
  })
})

describe('mapFulfillmentStatus (Noon)', () => {
  it('maps all known statuses', () => {
    expect(mapFulfillmentStatus('pending')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('confirmed')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('processing')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('shipped')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('delivered')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('returned')).toBe('RESTOCKED')
    expect(mapFulfillmentStatus('cancelled')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('failed')).toBe('UNFULFILLED')
  })
})
