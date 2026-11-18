import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawMyCashflowOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/mycashflow/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawMyCashflowOrder> = {}): RawMyCashflowOrder {
  return {
    id: 1001,
    status: 'open',
    payment_status: 'paid',
    customer_id: 42,
    email: 'user@example.com',
    phone: '+358501234567',
    currency: 'EUR',
    total: 59.9,
    subtotal: 54.0,
    total_tax: 11.8,
    shipping_cost: 4.9,
    discount_total: 0,
    order_rows: [
      {
        id: 5001,
        product_id: 99,
        variation_id: 200,
        name: 'Widget Pro',
        code: 'WP-001',
        quantity: 2,
        unit_price: 27.0,
      },
    ],
    billing_address: {
      address: 'Mannerheimintie 1',
      city: 'Helsinki',
      postal_code: '00100',
      country: 'FI',
    },
    shipping_address: {
      address: 'Mannerheimintie 1',
      city: 'Helsinki',
      postal_code: '00100',
      country: 'FI',
    },
    note: 'Leave at door',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (MyCashflow)', () => {
  it('maps id to string canonical id', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('1001')
  })

  it('maps customerId from customer_id', () => {
    const result = transformOrder(makeRaw())
    expect(result.customerId).toBe('42')
  })

  it('converts total major units to minor units', () => {
    const result = transformOrder(makeRaw())
    // EUR 2 decimal digits → 59.90 × 100 = 5990
    expect(result.totalPrice).toEqual({ amount: 5990, currency: 'EUR' })
  })

  it('maps payment_status=paid to PAID financial status', () => {
    const result = transformOrder(makeRaw())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps payment_status=refunded to REFUNDED financial status', () => {
    const result = transformOrder(makeRaw({ payment_status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('maps cancelled status to VOIDED financial status', () => {
    const result = transformOrder(makeRaw({ status: 'cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status=open to UNFULFILLED fulfillment status', () => {
    const result = transformOrder(makeRaw())
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('sets cancelledAt when status is cancelled', () => {
    const result = transformOrder(
      makeRaw({ status: 'cancelled', updated_at: '2024-03-05T00:00:00Z' }),
    )
    expect(result.cancelledAt).toBe('2024-03-05T00:00:00Z')
  })

  it('maps order_rows to lineItems', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('5001')
    expect(li.title).toBe('Widget Pro')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2700, currency: 'EUR' })
    expect(li.sku).toBe('WP-001')
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeRaw())
    expect(result.shippingAddress).toMatchObject({
      line1: 'Mannerheimintie 1',
      city: 'Helsinki',
      postalCode: '00100',
      country: 'FI',
    })
  })

  it('maps note', () => {
    const result = transformOrder(makeRaw())
    expect(result.note).toBe('Leave at door')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (MyCashflow)', () => {
  it('round-trips email, phone, and currency', () => {
    const raw = makeRaw()
    const order = transformOrder(raw)
    const body = untransformOrder(order)
    expect(body['email']).toBe('user@example.com')
    expect(body['phone']).toBe('+358501234567')
    expect(body['currency']).toBe('EUR')
  })
})
