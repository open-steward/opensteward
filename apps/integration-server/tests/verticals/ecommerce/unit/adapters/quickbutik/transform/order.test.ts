import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawQuickbutikOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/quickbutik/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawQuickbutikOrder> = {}): RawQuickbutikOrder {
  return {
    order_id: 1001,
    status: 'paid',
    currency: 'EUR',
    total_amount: '99.99',
    date_created: '2025-01-29 11:35:39',
    products: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps order_id to id, orderNumber, and name', () => {
    const result = transformOrder(makeOrder({ order_id: 1001 }))
    expect(result.id).toBe('1001')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
  })

  it('maps status "paid" → financialStatus PAID, fulfillmentStatus UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'paid' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status "done" → financialStatus PAID, fulfillmentStatus FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'done' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps status "unpaid" → financialStatus PENDING, fulfillmentStatus UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'unpaid' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status "cancelled" → financialStatus VOIDED, fulfillmentStatus UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('converts space-separated date_created to ISO with Z', () => {
    const result = transformOrder(makeOrder({ date_created: '2025-01-29 11:35:39' }))
    expect(result.createdAt).toBe('2025-01-29T11:35:39Z')
  })

  it('converts total_amount decimal string to minor units', () => {
    const result = transformOrder(makeOrder({ total_amount: '99.99', currency: 'EUR' }))
    expect(result.totalPrice?.amount).toBe(9999)
    expect(result.totalPrice?.currency).toBe('EUR')
  })

  it('maps customer email and phone from embedded customer', () => {
    const result = transformOrder(
      makeOrder({
        customer: {
          email: 'user@example.com',
          phone_number: '+46700000001',
        },
      }),
    )
    expect(result.email).toBe('user@example.com')
    expect(result.phone).toBe('+46700000001')
  })

  it('maps line items from products array', () => {
    const result = transformOrder(
      makeOrder({
        currency: 'SEK',
        products: [{ id: 5, title: 'Blue Hat', qty: 2, price: '10.00', product_id: 99 }],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.title).toBe('Blue Hat')
    expect(result.lineItems?.[0]?.quantity).toBe(2)
    expect(result.lineItems?.[0]?.price.amount).toBe(1000)
  })

  it('defaults currency to SEK when not provided', () => {
    const raw: RawQuickbutikOrder = { order_id: 2, status: 'paid', products: [] }
    const result = transformOrder(raw)
    expect(result.currency).toBe('SEK')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder', () => {
  it('maps email and phone into customer block', () => {
    const body = untransformOrder({ email: 'a@b.com', phone: '+1555' })
    expect((body['customer'] as Record<string, unknown>)['email']).toBe('a@b.com')
    expect((body['customer'] as Record<string, unknown>)['phone_number']).toBe('+1555')
  })

  it('maps shipping address fields into customer.shipping_details', () => {
    const body = untransformOrder({
      shippingAddress: {
        line1: '1 Main St',
        city: 'Stockholm',
        postalCode: '11122',
        country: 'SE',
      },
    })
    const shippingDetails = (body['customer'] as Record<string, unknown>)[
      'shipping_details'
    ] as Record<string, unknown>
    expect(shippingDetails['address']).toBe('1 Main St')
    expect(shippingDetails['city']).toBe('Stockholm')
  })
})
