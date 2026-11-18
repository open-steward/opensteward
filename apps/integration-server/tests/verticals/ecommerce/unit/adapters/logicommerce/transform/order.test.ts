import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShopifyOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawShopifyOrder> = {}): RawShopifyOrder {
  return {
    id: 4001,
    order_number: 2001,
    name: '#2001',
    customer: { id: 55 },
    email: 'carlos@example.com',
    currency: 'EUR',
    subtotal_price: '49.99',
    total_tax: '4.00',
    total_discounts: '0.00',
    total_price: '53.99',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    line_items: [
      {
        id: 21,
        product_id: 9001,
        variant_id: 9101,
        title: 'LogiProduct',
        quantity: 1,
        price: '49.99',
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (logicommerce / Shopify)', () => {
  it('maps id to string', () => {
    const result = transformOrder(makeOrder({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps order_number to orderNumber string', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('2001')
  })

  it('maps currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('EUR')
  })

  it('converts subtotal_price major units to minor units for EUR', () => {
    // 49.99 EUR → 4999 cents
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice?.amount).toBe(4999)
    expect(result.subtotalPrice?.currency).toBe('EUR')
  })

  it('maps paid financial_status to PAID', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps fulfilled fulfillment_status to FULFILLED', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps line_items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.title).toBe('LogiProduct')
    expect(result.lineItems?.[0]?.price.amount).toBe(4999)
    expect(result.lineItems?.[0]?.price.currency).toBe('EUR')
  })

  it('maps email', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('carlos@example.com')
  })

  it('stores raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (logicommerce / Shopify)', () => {
  it('maps email', () => {
    const body = untransformOrder({ email: 'test@example.com' })
    expect(body.email).toBe('test@example.com')
  })

  it('round-trips email and currency', () => {
    const canonical = transformOrder(makeOrder())
    const body = untransformOrder(canonical)
    expect(body.email).toBe('carlos@example.com')
    expect(body.currency).toBe('EUR')
  })
})
