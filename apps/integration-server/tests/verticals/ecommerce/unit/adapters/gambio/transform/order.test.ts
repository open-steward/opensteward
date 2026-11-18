import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawWooCommerceOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/gambio/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawWooCommerceOrder> = {}): RawWooCommerceOrder {
  return {
    id: 1001,
    number: '1001',
    status: 'processing',
    currency: 'USD',
    customer_id: 42,
    customer_note: 'Please leave at door',
    billing: {
      address_1: '1 Programming Ln',
      city: 'London',
      postcode: 'EC1A 1BB',
      country: 'GB',
      email: 'ada@example.com',
      phone: '+44 20 7946 0958',
    },
    shipping: {
      address_1: '1 Programming Ln',
      city: 'London',
      postcode: 'EC1A 1BB',
      country: 'GB',
    },
    total: '113.99',
    subtotal: '100.00',
    total_tax: '8.00',
    discount_total: '5.00',
    shipping_total: '5.99',
    line_items: [
      {
        id: 9001,
        name: 'Blue Widget',
        product_id: 777,
        quantity: 2,
        price: 50,
        subtotal: '100.00',
        total: '100.00',
      },
    ],
    coupon_lines: [{ code: 'SAVE5' }],
    refunds: [{ id: 800, total: '-5.00' }],
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-03-05T00:00:00Z',
    date_paid_gmt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (Gambio / WooCommerce)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
    expect(result.customerId).toBe('42')
    expect(result.email).toBe('ada@example.com')
    expect(result.currency).toBe('USD')
    expect(result.note).toBe('Please leave at door')
  })

  it('splits WC status into financial + fulfillment status pair', () => {
    expect(transformOrder(makeOrder({ status: 'processing' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ status: 'processing' })).fulfillmentStatus).toBe(
      'UNFULFILLED',
    )
    expect(transformOrder(makeOrder({ status: 'completed' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ status: 'completed' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ status: 'cancelled' })).financialStatus).toBe('VOIDED')
    expect(transformOrder(makeOrder({ status: 'pending' })).financialStatus).toBe('PENDING')
    expect(transformOrder(makeOrder({ status: 'refunded' })).financialStatus).toBe('REFUNDED')
  })

  it('converts money fields from major to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 11399, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 10000, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 800, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 599, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.title).toBe('Blue Widget')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps coupon codes and refund ids', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE5'])
    expect(result.refundIds).toEqual(['800'])
  })

  it('treats customer_id 0 as guest (undefined customerId)', () => {
    const result = transformOrder(makeOrder({ customer_id: 0 }))
    expect(result.customerId).toBeUndefined()
  })

  it('sets cancelledAt only for cancelled status', () => {
    const cancelled = transformOrder(
      makeOrder({ status: 'cancelled', date_modified_gmt: '2024-03-06T00:00:00Z' }),
    )
    expect(cancelled.cancelledAt).toBe('2024-03-06T00:00:00Z')

    const processing = transformOrder(makeOrder({ status: 'processing' }))
    expect(processing.cancelledAt).toBeUndefined()
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
    const back = untransformOrder(canonical)
    expect(back.currency).toBe('USD')
    expect(back.customer_note).toBe('Please leave at door')
  })
})
