import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawCartpandaOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/cartpanda/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawCartpandaOrder> = {}): RawCartpandaOrder {
  return {
    id: 5000,
    order_number: 1042,
    name: '#1042',
    customer: { id: 99, email: 'buyer@example.com' },
    email: 'buyer@example.com',
    phone: '+5511988880000',
    currency: 'BRL',
    subtotal_price: '200.00',
    total_tax: '36.00',
    total_discounts: '10.00',
    total_shipping: '15.00',
    total_price: '241.00',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    line_items: [
      {
        id: 8001,
        product_id: 301,
        variant_id: 401,
        title: 'Camiseta',
        quantity: 2,
        price: '100.00',
        sku: 'CAM-P-PRETA',
      },
    ],
    billing_address: {
      address1: 'Av. Paulista, 1000',
      city: 'São Paulo',
      zip: '01310-100',
      country_code: 'BR',
    },
    tags: 'sale, express',
    note: 'Leave at door',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id and orderNumber to strings', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('5000')
    expect(result.orderNumber).toBe('1042')
  })

  it('maps customerId from nested customer object', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('99')
  })

  it('maps email from top-level field', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('buyer@example.com')
  })

  it('converts totalPrice to minor units (BRL)', () => {
    // 241.00 BRL → 24100 minor units
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 24100, currency: 'BRL' })
  })

  it('converts totalShipping to minor units (BRL)', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalShipping).toEqual({ amount: 1500, currency: 'BRL' })
  })

  it('maps financial_status "paid" to PAID', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps fulfillment_status "fulfilled" to FULFILLED', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('8001')
    expect(li.productId).toBe('301')
    expect(li.variantId).toBe('401')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 10000, currency: 'BRL' })
    expect(li.sku).toBe('CAM-P-PRETA')
  })

  it('also accepts line items from raw.items field', () => {
    const raw = makeOrder({
      line_items: undefined,
      items: [{ id: 9999, title: 'Alt', quantity: 1 }],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.id).toBe('9999')
  })

  it('maps billing address', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.city).toBe('São Paulo')
    expect(result.billingAddress?.country).toBe('BR')
  })

  it('splits tags', () => {
    const result = transformOrder(makeOrder())
    expect(result.tags).toEqual(['sale', 'express'])
  })

  it('defaults currency to BRL when not provided', () => {
    const result = transformOrder(makeOrder({ currency: undefined }))
    expect(result.currency).toBe('BRL')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips note and email via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.note).toBe('Leave at door')
    expect(raw.email).toBe('buyer@example.com')
  })
})
