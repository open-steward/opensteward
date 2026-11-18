import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawMedusaOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/medusa/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawMedusaOrder> = {}): RawMedusaOrder {
  return {
    id: 'order_01',
    display_id: 1001,
    status: 'completed',
    payment_status: 'captured',
    fulfillment_status: 'fulfilled',
    customer_id: 'cus_01',
    email: 'ada@example.com',
    currency_code: 'USD',
    subtotal: 10000,
    tax_total: 825,
    discount_total: 500,
    shipping_total: 499,
    total: 10824,
    items: [
      {
        id: 'item_01',
        title: 'Ocean Blue T-Shirt',
        product_id: 'prod_01',
        variant_id: 'variant_01',
        quantity: 2,
        unit_price: 4999,
        total: 9998,
      },
    ],
    billing_address: {
      address_1: '1 Programming Ln',
      city: 'London',
      province: 'England',
      postal_code: 'NW1 2AB',
      country_code: 'GB',
    },
    shipping_address: {
      address_1: '1 Programming Ln',
      city: 'London',
      province: 'England',
      postal_code: 'NW1 2AB',
      country_code: 'GB',
    },
    fulfillments: [{ id: 'ful_01' }],
    refunds: [],
    discounts: [{ code: 'SAVE5' }],
    created_at: '2024-05-01T10:00:00Z',
    updated_at: '2024-05-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (Medusa v2)', () => {
  it('maps core fields and converts cents to decimal', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order_01')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
    expect(result.customerId).toBe('cus_01')
    expect(result.email).toBe('ada@example.com')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 10824, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 10000, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 825, currency: 'USD' })
  })

  it('maps financial and fulfillment status', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps line items with unit price in decimal', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('item_01')
    expect(li.productId).toBe('prod_01')
    expect(li.variantId).toBe('variant_01')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('maps status combinations correctly', () => {
    const cases: Array<[
      string | undefined,
      string | undefined,
      string | undefined,
      string | undefined,
    ]> = [
      ['pending', undefined, 'PENDING', 'UNFULFILLED'],
      ['completed', 'captured', 'PAID', 'FULFILLED'],
      ['canceled', undefined, 'VOIDED', 'UNFULFILLED'],
      [undefined, 'refunded', 'REFUNDED', 'UNFULFILLED'],
      [undefined, 'partially_refunded', 'PARTIALLY_REFUNDED', 'UNFULFILLED'],
      [undefined, 'authorized', 'AUTHORIZED', 'UNFULFILLED'],
    ]
    for (const [status, paymentStatus, expectedFin, expectedFul] of cases) {
      const r = transformOrder(
        makeOrder({ status, payment_status: paymentStatus, fulfillment_status: undefined }),
      )
      expect(r.financialStatus).toBe(expectedFin)
      expect(r.fulfillmentStatus).toBe(expectedFul)
    }
  })

  it('preserves raw payload in metadata and produces schema-valid result', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const body = untransformOrder(canonical)
    expect(body['email']).toBe('ada@example.com')
    expect(body['customer_id']).toBe('cus_01')
    expect(body['currency_code']).toBe('USD')
    const billing = body['billing_address'] as Record<string, unknown>
    expect(billing['address_1']).toBe('1 Programming Ln')
  })

  it('converts line item prices to cents in untransform', () => {
    const body = untransformOrder({
      lineItems: [
        {
          id: 'li_01',
          title: 'Test',
          quantity: 1,
          price: { amount: 2999, currency: 'USD' },
          metadata: {},
        },
      ],
    })
    const items = body['items'] as Array<{ unit_price?: number }>
    expect(items[0]!.unit_price).toBe(2999)
  })
})
