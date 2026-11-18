import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawWooCommerceOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/ankorstore/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawWooCommerceOrder> = {}): RawWooCommerceOrder {
  return {
    id: 1001,
    number: '1001',
    status: 'processing',
    currency: 'USD',
    customer_id: 77,
    customer_note: 'Please gift wrap',
    billing: {
      address_1: '100 Main St',
      city: 'Portland',
      state: 'OR',
      postcode: '97201',
      country: 'US',
      email: 'customer@example.com',
      phone: '503-555-0123',
    },
    shipping: {
      address_1: '100 Main St',
      city: 'Portland',
      state: 'OR',
      postcode: '97201',
      country: 'US',
    },
    total: '59.98',
    subtotal: '49.98',
    total_tax: '5.00',
    discount_total: '0.00',
    shipping_total: '5.00',
    line_items: [
      {
        id: 10,
        name: 'Blue Widget',
        product_id: 500,
        variation_id: 501,
        quantity: 2,
        price: 24.99,
        total: '49.98',
      },
    ],
    coupon_lines: [{ id: 1, code: 'SUMMER10' }],
    refunds: [{ id: 20, total: '-5.00' }],
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (Ankorstore / WooCommerce)', () => {
  it('maps id to string', () => {
    const result = transformOrder(makeOrder({ id: 999 }))
    expect(result.id).toBe('999')
  })

  it('maps orderNumber and name', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
  })

  it('maps processing status to PAID / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'processing' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps completed status to PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'completed' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps cancelled status to VOIDED / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps refunded status to REFUNDED', () => {
    const result = transformOrder(makeOrder({ status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('maps currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('USD')
  })

  it('converts total to minor units', () => {
    const result = transformOrder(makeOrder({ total: '59.98' }))
    expect(result.totalPrice?.amount).toBe(5998)
  })

  it('converts shipping_total to minor units', () => {
    const result = transformOrder(makeOrder({ shipping_total: '5.00' }))
    expect(result.totalShipping?.amount).toBe(500)
  })

  it('maps customerId from customer_id', () => {
    const result = transformOrder(makeOrder({ customer_id: 77 }))
    expect(result.customerId).toBe('77')
  })

  it('maps email from billing', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('customer@example.com')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.title).toBe('Blue Widget')
    expect(result.lineItems?.[0]?.quantity).toBe(2)
  })

  it('converts line item unit price to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems?.[0]?.price.amount).toBe(2499)
  })

  it('maps variantId on line item', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems?.[0]?.variantId).toBe('501')
  })

  it('skips variantId when variation_id is 0', () => {
    const result = transformOrder(
      makeOrder({
        line_items: [
          {
            id: 10,
            name: 'Widget',
            product_id: 500,
            variation_id: 0,
            quantity: 1,
            total: '10.00',
          },
        ],
      }),
    )
    if (result.lineItems === undefined) throw new Error('expected lineItems to be defined')
    expect(result.lineItems[0]!.variantId).toBeUndefined()
  })

  it('maps billingAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('100 Main St')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('maps discount codes from coupon_lines', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SUMMER10'])
  })

  it('maps refundIds', () => {
    const result = transformOrder(makeOrder())
    expect(result.refundIds).toEqual(['20'])
  })

  it('maps note from customer_note', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Please gift wrap')
  })

  it('maps createdAt from date_created_gmt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('sets customerId to undefined when customer_id is 0', () => {
    const result = transformOrder(makeOrder({ customer_id: 0 }))
    expect(result.customerId).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (Ankorstore / WooCommerce)', () => {
  it('maps currency', () => {
    const body = untransformOrder({ currency: 'EUR' })
    expect(body.currency).toBe('EUR')
  })

  it('maps note to customer_note', () => {
    const body = untransformOrder({ note: 'Leave at door' })
    expect(body.customer_note).toBe('Leave at door')
  })

  it('maps billingAddress to billing', () => {
    const body = untransformOrder({
      billingAddress: { line1: '1 St', city: 'NYC', country: 'US' },
    })
    expect((body.billing as Record<string, unknown>).address_1).toBe('1 St')
  })
})
