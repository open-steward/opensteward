import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawWooCommerceOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/hepsiburada/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawWooCommerceOrder> = {}): RawWooCommerceOrder {
  return {
    id: 6001,
    number: '6001',
    status: 'processing',
    currency: 'TRY',
    customer_id: 77,
    customer_note: 'Hızlı teslimat lütfen',
    billing: {
      first_name: 'Ali',
      last_name: 'Yilmaz',
      address_1: 'Ataturk Cad. No:1',
      city: 'Istanbul',
      state: 'Istanbul',
      postcode: '34000',
      country: 'TR',
      email: 'ali@example.com.tr',
      phone: '+90-212-000-0001',
    },
    shipping: {
      address_1: 'Kargo Adres Sok. No:5',
      city: 'Ankara',
      state: 'Ankara',
      postcode: '06000',
      country: 'TR',
    },
    total: '299.99',
    subtotal: '249.99',
    total_tax: '45.00',
    discount_total: '25.00',
    shipping_total: '30.00',
    line_items: [
      {
        id: 1001,
        name: 'Laptop Çantası',
        product_id: 501,
        variation_id: 0,
        quantity: 1,
        total: '249.99',
        subtotal: '249.99',
        sku: 'CANTA-001',
        price: 249.99,
      },
    ],
    coupon_lines: [{ code: 'WELCOME10' }],
    refunds: [],
    date_created: '2024-03-01T00:00:00Z',
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-03-01T00:00:00Z',
    date_paid: null,
    date_paid_gmt: null,
    ...overrides,
  }
}

describe('transformOrder (hepsiburada / WooCommerce)', () => {
  it('maps id and orderNumber from number field', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('6001')
    expect(result.orderNumber).toBe('6001')
  })

  it('maps customerId when non-zero', () => {
    const result = transformOrder(makeRaw())
    expect(result.customerId).toBe('77')
  })

  it('maps "processing" status to PAID / UNFULFILLED', () => {
    const result = transformOrder(makeRaw({ status: 'processing' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps "completed" status to PAID / FULFILLED', () => {
    const result = transformOrder(makeRaw({ status: 'completed' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps "cancelled" status to VOIDED / UNFULFILLED', () => {
    const result = transformOrder(makeRaw({ status: 'cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps email and phone from billing', () => {
    const result = transformOrder(makeRaw())
    expect(result.email).toBe('ali@example.com.tr')
    expect(result.phone).toBe('+90-212-000-0001')
  })

  it('maps money fields in minor units', () => {
    const result = transformOrder(makeRaw())
    expect(result.totalPrice!.currency).toBe('TRY')
    expect(result.subtotalPrice!.currency).toBe('TRY')
    expect(result.totalTax!.currency).toBe('TRY')
  })

  it('maps line item title, quantity, and sku', () => {
    const result = transformOrder(makeRaw())
    const li = result.lineItems?.[0]!
    expect(li.title).toBe('Laptop Çantası')
    expect(li.quantity).toBe(1)
    expect(li.sku).toBe('CANTA-001')
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeRaw())
    expect(result.billingAddress?.city).toBe('Istanbul')
    expect(result.shippingAddress?.city).toBe('Ankara')
  })

  it('maps discount codes from coupon_lines', () => {
    const result = transformOrder(makeRaw())
    expect(result.discountCodes).toEqual(['WELCOME10'])
  })

  it('maps note from customer_note', () => {
    const result = transformOrder(makeRaw())
    expect(result.note).toBe('Hızlı teslimat lütfen')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })

  it('round-trips via untransformOrder', () => {
    const body = untransformOrder(transformOrder(makeRaw()))
    expect(body['currency']).toBe('TRY')
    expect(body['customer_note']).toBe('Hızlı teslimat lütfen')
  })
})
