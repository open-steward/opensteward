import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShopifyOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/sellfy/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawShopifyOrder> = {}): RawShopifyOrder {
  return {
    id: 1001,
    order_number: 1001,
    name: '#1001',
    customer: { id: 456 },
    email: 'buyer@example.com',
    phone: '+15551234567',
    currency: 'USD',
    subtotal_price: '89.00',
    total_tax: '8.00',
    total_discounts: '0.00',
    total_price: '99.00',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    line_items: [
      {
        id: 2001,
        product_id: 123,
        variant_id: 501,
        title: 'Digital Download',
        quantity: 1,
        price: '89.00',
        sku: 'DL-PDF-PERS',
        fulfillable_quantity: 0,
        fulfillment_status: 'fulfilled',
      },
    ],
    billing_address: {
      address1: '123 Main St',
      city: 'Springfield',
      zip: '62701',
      country_code: 'US',
    },
    shipping_address: null,
    fulfillments: [{ id: 3001 }],
    refunds: [],
    transactions: [{ id: 4001 }],
    discount_codes: [{ code: 'SAVE10' }],
    tags: 'vip, digital',
    note: 'Rush delivery',
    created_at: '2024-05-01T12:00:00Z',
    updated_at: '2024-05-02T08:00:00Z',
    processed_at: '2024-05-01T12:05:00Z',
    cancelled_at: null,
    cancel_reason: null,
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(typeof result.id).toBe('string')
    expect(result.name).toBe('#1001')
    expect(result.email).toBe('buyer@example.com')
    expect(result.currency).toBe('USD')
  })

  it('maps financial_status and fulfillment_status to uppercase enums', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('converts total_price to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 9900, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 8900, currency: 'USD' })
  })

  it('maps line_items array to lineItems', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems?.[0]!
    expect(li.id).toBe('2001')
    expect(li.title).toBe('Digital Download')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 8900, currency: 'USD' })
  })

  it('maps customerId from nested customer object', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('456')
  })

  it('maps billing address', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toMatchObject({
      line1: '123 Main St',
      city: 'Springfield',
      postalCode: '62701',
      country: 'US',
    })
  })

  it('maps fulfillmentIds and transactionIds', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toEqual(['3001'])
    expect(result.transactionIds).toEqual(['4001'])
  })

  it('maps discount codes and tags', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE10'])
    expect(result.tags).toEqual(['vip', 'digital'])
  })

  it('maps dates and note', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-05-01T12:00:00Z')
    expect(result.processedAt).toBe('2024-05-01T12:05:00Z')
    expect(result.note).toBe('Rush delivery')
  })

  it('defaults to USD when currency is not provided', () => {
    const raw = makeOrder({ currency: undefined })
    const result = transformOrder(raw)
    expect(result.currency).toBe('USD')
    expect(result.totalPrice?.currency).toBe('USD')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.email).toBe('buyer@example.com')
    expect(raw.note).toBe('Rush delivery')
    expect(raw.tags).toBe('vip, digital')
  })
})
