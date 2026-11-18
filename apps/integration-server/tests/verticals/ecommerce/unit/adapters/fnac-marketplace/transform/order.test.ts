import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawWooCommerceOrder,
  type RawWooCommerceLineItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/fnac-marketplace/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeLineItem(overrides: Partial<RawWooCommerceLineItem> = {}): RawWooCommerceLineItem {
  return {
    id: 101,
    name: 'Blu-ray Player',
    product_id: 201,
    variation_id: 0,
    quantity: 1,
    price: 59.99,
    total: '59.99',
    subtotal: '59.99',
    sku: 'BLU-001',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawWooCommerceOrder> = {}): RawWooCommerceOrder {
  return {
    id: 9001,
    number: '9001',
    status: 'processing',
    currency: 'EUR',
    customer_id: 5001,
    customer_note: 'Please gift wrap',
    total: '59.99',
    subtotal: '59.99',
    total_tax: '0.00',
    discount_total: '0.00',
    shipping_total: '5.00',
    billing: {
      email: 'client@example.fr',
      phone: '+33-1-0000-0000',
    },
    shipping: {
      address_1: '10 Rue de Rivoli',
      city: 'Paris',
      postcode: '75001',
      country: 'FR',
    },
    line_items: [makeLineItem()],
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (FNAC/WooCommerce)', () => {
  it('maps id and orderNumber', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('9001')
    expect(result.orderNumber).toBe('9001')
    expect(result.name).toBe('#9001')
  })

  it('maps email from billing', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('client@example.fr')
  })

  it('maps currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('EUR')
  })

  it('maps processing → PAID / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'processing' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps completed → PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'completed' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps cancelled → VOIDED / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps refunded → REFUNDED / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('converts total from major to minor units (EUR)', () => {
    // EUR has 2 decimal places so 59.99 → 5999
    const result = transformOrder(makeOrder({ total: '59.99', currency: 'EUR' }))
    expect(result.totalPrice).toEqual({ amount: 5999, currency: 'EUR' })
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('101')
    expect(li.title).toBe('Blu-ray Player')
    expect(li.quantity).toBe(1)
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress!.line1).toBe('10 Rue de Rivoli')
    expect(result.shippingAddress!.city).toBe('Paris')
    expect(result.shippingAddress!.country).toBe('FR')
  })

  it('maps note from customer_note', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Please gift wrap')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-02T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('round-trips via untransformOrder', () => {
    const result = transformOrder(makeOrder())
    const body = untransformOrder(result)
    expect(body.currency).toBe('EUR')
    expect(body.customer_note).toBe('Please gift wrap')
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
