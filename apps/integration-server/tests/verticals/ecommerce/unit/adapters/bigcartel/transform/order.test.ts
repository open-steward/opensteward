import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawBigCartelOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcartel/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(
  overrides: Partial<RawBigCartelOrder> = {},
): RawBigCartelOrder {
  return {
    id: 'ord-999',
    type: 'orders',
    attributes: {
      order_number: 1042,
      status: 'completed',
      customer_email: 'buyer@example.com',
      customer_first_name: 'Jane',
      customer_last_name: 'Doe',
      customer_phone: '+1-555-0100',
      subtotal: '49.98',
      total: '54.97',
      discount: '0',
      shipping_total: '4.99',
      tax_total: '0',
      currency: 'USD',
      billing_address: {
        first_name: 'Jane',
        last_name: 'Doe',
        address1: '123 Main St',
        address2: 'Apt 4',
        city: 'Portland',
        state: 'OR',
        zip: '97201',
        country: 'US',
      },
      shipping_address: {
        first_name: 'Jane',
        last_name: 'Doe',
        address1: '123 Main St',
        city: 'Portland',
        state: 'OR',
        zip: '97201',
        country: 'US',
      },
      items: [
        {
          id: 'li-1',
          product_name: 'Lavender Candle',
          product_id: 'prod-1',
          quantity: 2,
          unit_price: '24.99',
          total_price: '49.98',
        },
      ],
      customer_note: 'Gift wrap please',
      created_at: '2024-03-20T15:00:00Z',
      updated_at: '2024-03-21T09:00:00Z',
      completed_at: '2024-03-21T09:00:00Z',
    },
    ...overrides,
  }
}

describe('transformOrder (Big Cartel)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ord-999')
    expect(result.orderNumber).toBe('1042')
    expect(result.name).toBe('#1042')
    expect(result.email).toBe('buyer@example.com')
    expect(result.phone).toBe('+1-555-0100')
    expect(result.currency).toBe('USD')
  })

  it('maps money fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 4998, currency: 'USD' })
    expect(result.totalPrice).toEqual({ amount: 5497, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 0, currency: 'USD' })
  })

  it('maps completed status to PAID + FULFILLED', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps pending status to PENDING + UNFULFILLED', () => {
    const raw = makeOrder({
      attributes: { ...makeOrder().attributes, status: 'pending' },
    })
    const result = transformOrder(raw)
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps cancelled status to VOIDED + UNFULFILLED', () => {
    const raw = makeOrder({
      attributes: { ...makeOrder().attributes, status: 'cancelled' },
    })
    const result = transformOrder(raw)
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelledAt).toBeDefined()
  })

  it('maps refunded status to REFUNDED + UNFULFILLED', () => {
    const raw = makeOrder({
      attributes: { ...makeOrder().attributes, status: 'refunded' },
    })
    const result = transformOrder(raw)
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-1')
    expect(li.productId).toBe('prod-1')
    expect(li.title).toBe('Lavender Candle')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toMatchObject({
      line1: '123 Main St',
      line2: 'Apt 4',
      city: 'Portland',
      region: 'OR',
      postalCode: '97201',
      country: 'US',
    })
    expect(result.shippingAddress).toMatchObject({
      line1: '123 Main St',
      city: 'Portland',
    })
  })

  it('maps note and timestamps', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Gift wrap please')
    expect(result.createdAt).toBe('2024-03-20T15:00:00Z')
    expect(result.processedAt).toBe('2024-03-21T09:00:00Z')
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

  it('handles order with no items or addresses', () => {
    const raw = makeOrder({
      attributes: {
        order_number: 1,
        status: 'pending',
        total: '0',
        currency: 'USD',
        items: [],
        billing_address: null,
        shipping_address: null,
      },
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toEqual([])
    expect(result.billingAddress).toBeUndefined()
    expect(result.shippingAddress).toBeUndefined()
  })
})

describe('untransformOrder (Big Cartel)', () => {
  it('maps note to customer_note', () => {
    const body = untransformOrder({ note: 'Handle with care' }) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(body.data.type).toBe('orders')
    expect(body.data.attributes['customer_note']).toBe('Handle with care')
  })
})
