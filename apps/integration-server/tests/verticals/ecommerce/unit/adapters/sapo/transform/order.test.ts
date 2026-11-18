import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawSapoOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/sapo/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawSapoOrder> = {}): RawSapoOrder {
  return {
    id: 1001,
    order_number: 5001,
    name: '#5001',
    customer: { id: 7001 },
    email: 'nguyen@example.vn',
    phone: '+84 90 123 4567',
    currency: 'VND',
    subtotal_price: '450000',
    total_tax: '0',
    total_discounts: '50000',
    total_shipping: '30000',
    total_price: '430000',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    line_items: [
      {
        id: 201,
        product_id: 301,
        variant_id: 401,
        title: 'Áo Thun',
        quantity: 2,
        price: '150000',
        total_discount: '0',
        sku: 'AT-001',
        fulfillable_quantity: 0,
        fulfillment_status: 'fulfilled',
      },
    ],
    billing_address: {
      address1: '123 Đường Lê Lợi',
      city: 'Hồ Chí Minh',
      zip: '700000',
      country_code: 'VN',
    },
    shipping_address: {
      address1: '456 Đường Nguyễn Huệ',
      city: 'Hồ Chí Minh',
      zip: '700000',
      country_code: 'VN',
    },
    fulfillments: [{ id: 6001 }],
    refunds: [{ id: 7501 }],
    transactions: [{ id: 8001 }],
    discount_codes: [{ code: 'GIAM10' }],
    tags: 'priority, loyal',
    note: 'Giao nhanh',
    created_on: '2024-04-01T07:00:00Z',
    modified_on: '2024-04-02T09:00:00Z',
    processed_on: '2024-04-01T07:05:00Z',
    ...overrides,
  }
}

describe('transformOrder (Sapo)', () => {
  it('stringifies id and order_number', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(result.orderNumber).toBe('5001')
  })

  it('maps customer id and contact fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('7001')
    expect(result.email).toBe('nguyen@example.vn')
    expect(result.phone).toBe('+84 90 123 4567')
  })

  it('converts VND prices to minor units (no scaling for VND)', () => {
    // VND has 0 exponent: majorToMinor(450000, 'VND') === 450000
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 450000, currency: 'VND' })
    expect(result.totalPrice).toEqual({ amount: 430000, currency: 'VND' })
  })

  it('maps financial_status to canonical enum', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps fulfillment_status to canonical enum', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps line items with stringified ids and VND price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('201')
    expect(li.productId).toBe('301')
    expect(li.title).toBe('Áo Thun')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 150000, currency: 'VND' })
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('123 Đường Lê Lợi')
    expect(result.billingAddress?.country).toBe('VN')
    expect(result.shippingAddress?.line1).toBe('456 Đường Nguyễn Huệ')
  })

  it('maps related ids arrays', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toEqual(['6001'])
    expect(result.refundIds).toEqual(['7501'])
    expect(result.transactionIds).toEqual(['8001'])
    expect(result.discountCodes).toEqual(['GIAM10'])
  })

  it('splits tags and maps timestamps using _on suffix', () => {
    const result = transformOrder(makeOrder())
    expect(result.tags).toEqual(['priority', 'loyal'])
    expect(result.createdAt).toBe('2024-04-01T07:00:00Z')
    expect(result.updatedAt).toBe('2024-04-02T09:00:00Z')
    expect(result.processedAt).toBe('2024-04-01T07:05:00Z')
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

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.email).toBe('nguyen@example.vn')
    expect(raw.note).toBe('Giao nhanh')
    expect(raw.tags).toBe('priority, loyal')
  })
})
