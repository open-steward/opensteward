import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawWooCommerceOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/woocommerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawWooCommerceOrder> = {}): RawWooCommerceOrder {
  return {
    id: 1001,
    number: '1001',
    status: 'completed',
    currency: 'USD',
    customer_id: 7001,
    customer_note: 'Gift wrap please',
    billing: {
      first_name: 'Ada',
      last_name: 'Lovelace',
      address_1: '1 Programming Ln',
      city: 'London',
      state: 'England',
      postcode: 'NW1 2AB',
      country: 'GB',
      email: 'ada@example.com',
      phone: '+1 555 000 1111',
    },
    shipping: {
      first_name: 'Ada',
      last_name: 'Lovelace',
      address_1: '1 Programming Ln',
      city: 'London',
      state: 'England',
      postcode: 'NW1 2AB',
      country: 'GB',
    },
    payment_method: 'stripe',
    total: '108.24',
    subtotal: '100.00',
    total_tax: '8.25',
    discount_total: '5.00',
    shipping_total: '4.99',
    line_items: [
      {
        id: 9001,
        name: 'Ocean Blue T-Shirt',
        product_id: 987654321,
        variation_id: 501,
        quantity: 2,
        total: '99.98',
        subtotal: '99.98',
        sku: 'TEE-S-BLUE',
        price: 49.99,
      },
    ],
    coupon_lines: [{ id: 1, code: 'SAVE5' }],
    refunds: [],
    date_created: '2024-05-01T10:00:00.000Z',
    date_created_gmt: '2024-05-01T10:00:00.000Z',
    date_modified: '2024-05-01T12:00:00.000Z',
    date_modified_gmt: '2024-05-01T12:00:00.000Z',
    date_paid: '2024-05-01T10:00:00.000Z',
    date_paid_gmt: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrder (WooCommerce)', () => {
  it('maps core fields and splits status into canonical pair', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
    expect(result.customerId).toBe('7001')
    expect(result.email).toBe('ada@example.com')
    expect(result.currency).toBe('USD')
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
    expect(result.totalPrice).toEqual({ amount: 10824, currency: 'USD' })
  })

  it('maps line items with unit price derived from total/quantity', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.productId).toBe('987654321')
    expect(li.variantId).toBe('501')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(li.sku).toBe('TEE-S-BLUE')
  })

  it('covers every WC status → canonical pair mapping', () => {
    const cases: Array<[
      RawWooCommerceOrder['status'],
      string | undefined,
      string | undefined,
    ]> = [
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
    expect(body['customer_note']).toBe('Gift wrap please')
    const billing = body['billing'] as { address_1?: string; email?: string }
    expect(billing.address_1).toBe('1 Programming Ln')
    expect(billing.email).toBe('ada@example.com')
  })
})
