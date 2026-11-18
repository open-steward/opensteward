import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawWooCommerceOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/wbuy/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawWooCommerceOrder> = {}): RawWooCommerceOrder {
  return {
    id: 1001,
    number: '1001',
    status: 'completed',
    currency: 'USD',
    total: '59.99',
    billing: {
      email: 'buyer@example.com',
      address_1: '10 Elm',
      city: 'Austin',
      country: 'US',
    },
    line_items: [
      {
        id: 1,
        name: 'T-Shirt',
        quantity: 2,
        price: 29.99,
        total: '59.98',
      },
    ],
    date_created_gmt: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrder (wbuy)', () => {
  it('maps core fields and splits status into canonical pair', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
    expect(result.email).toBe('buyer@example.com')
    expect(result.currency).toBe('USD')
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
    expect(result.totalPrice).toEqual({ amount: 5999, currency: 'USD' })
  })

  it('maps line items with unit price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1')
    expect(li.title).toBe('T-Shirt')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('covers every WC status → canonical pair mapping', () => {
    const cases: Array<[string | undefined, string | undefined, string | undefined]> = [
      ['pending', 'PENDING', 'UNFULFILLED'],
      ['processing', 'PAID', 'UNFULFILLED'],
      ['on-hold', 'PENDING', 'UNFULFILLED'],
      ['completed', 'PAID', 'FULFILLED'],
      ['cancelled', 'VOIDED', 'UNFULFILLED'],
      ['refunded', 'REFUNDED', 'UNFULFILLED'],
      ['failed', 'VOIDED', 'UNFULFILLED'],
    ]
    for (const [status, fin, ful] of cases) {
      const r = transformOrder(makeOrder({ status }))
      expect(r.financialStatus).toBe(fin)
      expect(r.fulfillmentStatus).toBe(ful)
    }
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const body = untransformOrder(canonical)
    expect(body['currency']).toBe('USD')
    const billing = body['billing'] as { address_1?: string; email?: string }
    expect(billing.address_1).toBe('10 Elm')
    expect(billing.email).toBe('buyer@example.com')
  })
})
