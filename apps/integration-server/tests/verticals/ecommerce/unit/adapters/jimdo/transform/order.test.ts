import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShopifyOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/jimdo/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

describe('transformOrder (jimdo)', () => {
  const raw: RawShopifyOrder = {
    id: 1001,
    order_number: 1042,
    name: '#1042',
    customer: { id: 987 },
    email: 'jane.doe@example.com',
    phone: '+14155550123',
    currency: 'USD',
    subtotal_price: '49.99',
    total_tax: '4.37',
    total_discounts: '5.00',
    total_price: '54.36',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    line_items: [
      {
        id: 11,
        product_id: 22,
        variant_id: 33,
        title: 'Wireless Keyboard',
        quantity: 1,
        price: '49.99',
        total_discount: '5.00',
        sku: 'WK-2024',
      },
    ],
    billing_address: {
      address1: '123 Main St',
      city: 'San Francisco',
      zip: '94102',
      country_code: 'US',
    },
    fulfillments: [{ id: 500 }],
    refunds: [{ id: 600 }],
    transactions: [{ id: 700 }],
    discount_codes: [{ code: 'SAVE5' }],
    tags: 'vip',
    note: 'Leave at door',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformOrder(raw)
    expect(result.id).toBe('1001')
  })

  it('maps orderNumber and name', () => {
    const result = transformOrder(raw)
    expect(result.orderNumber).toBe('1042')
    expect(result.name).toBe('#1042')
  })

  it('maps financial status paid → PAID', () => {
    const result = transformOrder(raw)
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps fulfillment status fulfilled → FULFILLED', () => {
    const result = transformOrder(raw)
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('converts total price to minor units (USD × 100)', () => {
    const result = transformOrder(raw)
    // 54.36 → 5436 cents
    expect(result.totalPrice).toEqual({ amount: 5436, currency: 'USD' })
  })

  it('maps line items with minor-unit prices', () => {
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.title).toBe('Wireless Keyboard')
    // 49.99 → 4999
    expect(result.lineItems![0]!.price).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('maps fulfillmentIds, refundIds, transactionIds as string arrays', () => {
    const result = transformOrder(raw)
    expect(result.fulfillmentIds).toEqual(['500'])
    expect(result.refundIds).toEqual(['600'])
    expect(result.transactionIds).toEqual(['700'])
  })

  it('maps discountCodes', () => {
    const result = transformOrder(raw)
    expect(result.discountCodes).toEqual(['SAVE5'])
  })

  it('produces schema-valid output', () => {
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformOrder', () => {
    const result = transformOrder(raw)
    const back = untransformOrder(result)
    expect(back.email).toBe(raw.email)
    expect(back.note).toBe(raw.note)
  })
})
