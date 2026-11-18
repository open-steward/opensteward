import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawIzbergMerchantOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/izberg/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawIzbergMerchantOrder> = {}): RawIzbergMerchantOrder {
  return {
    id: 5001,
    order_number: 'ORD-2024-001',
    status: 'accepted',
    currency: 'EUR',
    total_price: '149.99',
    items: [
      {
        id: 9001,
        product_name: 'Wireless Headphones',
        quantity: 1,
        base_price: '149.99',
        price: '149.99',
        offer_sku: 'WH-001',
        product_id: 42,
        variation_id: 100,
      },
    ],
    billing_address: {
      first_name: 'Alice',
      last_name: 'Dupont',
      address: '10 Rue de la Paix',
      city: 'Paris',
      zipcode: '75001',
      country: 'FR',
    },
    shipping_address: {
      first_name: 'Alice',
      last_name: 'Dupont',
      address: '10 Rue de la Paix',
      city: 'Paris',
      zipcode: '75001',
      country: 'FR',
    },
    customer_email: 'alice@example.com',
    customer_phone: '+33612345678',
    date_placed: '2024-03-01T00:00:00Z',
    date_modified: '2024-03-01T01:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (izberg)', () => {
  it('maps id as string and orderNumber', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('5001')
    expect(result.orderNumber).toBe('ORD-2024-001')
    expect(result.name).toBe('#ORD-2024-001')
  })

  it('maps email and phone', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('alice@example.com')
    expect(result.phone).toBe('+33612345678')
  })

  it('maps currency and totalPrice in minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('EUR')
    // 149.99 EUR → 14999 minor units
    expect(result.totalPrice).toEqual({ amount: 14999, currency: 'EUR' })
  })

  it('maps accepted → PAID/UNFULFILLED statuses', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps all izberg statuses to canonical pairs', () => {
    const cases: [string, string, string][] = [
      ['waiting_acceptance', 'PENDING', 'UNFULFILLED'],
      ['waiting_debit', 'PENDING', 'UNFULFILLED'],
      ['payment_refused', 'VOIDED', 'UNFULFILLED'],
      ['cancelled', 'VOIDED', 'UNFULFILLED'],
      ['accepted', 'PAID', 'UNFULFILLED'],
      ['shipping', 'PAID', 'PARTIAL'],
      ['shipped', 'PAID', 'FULFILLED'],
      ['completed', 'PAID', 'FULFILLED'],
      ['refunded', 'REFUNDED', 'UNFULFILLED'],
    ]
    for (const [raw, fin, ful] of cases) {
      const result = transformOrder(makeOrder({ status: raw }))
      expect(result.financialStatus).toBe(fin)
      expect(result.fulfillmentStatus).toBe(ful)
    }
  })

  it('sets cancelledAt when status is cancelled', () => {
    // toIsoDatetime normalises to full ISO 8601 with milliseconds via Date.toISOString()
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.cancelledAt).toBe('2024-03-01T01:00:00.000Z')
  })

  it('does not set cancelledAt for non-cancelled orders', () => {
    const result = transformOrder(makeOrder({ status: 'accepted' }))
    expect(result.cancelledAt).toBeUndefined()
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.productId).toBe('42')
    expect(li.variantId).toBe('100')
    expect(li.title).toBe('Wireless Headphones')
    expect(li.quantity).toBe(1)
    // 149.99 EUR → 14999 minor units
    expect(li.price).toEqual({ amount: 14999, currency: 'EUR' })
    expect(li.sku).toBe('WH-001')
  })

  it('falls back to order_items when items is absent', () => {
    const result = transformOrder(
      makeOrder({
        items: undefined,
        order_items: [
          {
            id: 9002,
            product_name: 'Keyboard',
            quantity: 1,
            base_price: '79.00',
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.title).toBe('Keyboard')
  })

  it('maps billingAddress and shippingAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('10 Rue de la Paix')
    expect(result.billingAddress?.city).toBe('Paris')
    expect(result.billingAddress?.postalCode).toBe('75001')
    expect(result.billingAddress?.country).toBe('FR')
    expect(result.shippingAddress?.line1).toBe('10 Rue de la Paix')
  })

  it('maps createdAt and updatedAt via toIsoDatetime', () => {
    // toIsoDatetime normalises to full ISO 8601 with milliseconds via Date.toISOString()
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T01:00:00.000Z')
  })

  it('defaults currency to EUR when not set', () => {
    const result = transformOrder(makeOrder({ currency: null }))
    expect(result.currency).toBe('EUR')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const body = untransformOrder(canonical)
    expect(body['customer_email']).toBe('alice@example.com')
    expect(body['customer_phone']).toBe('+33612345678')
    const addr = body['shipping_address'] as Record<string, unknown>
    expect(addr['address']).toBe('10 Rue de la Paix')
    expect(addr['city']).toBe('Paris')
  })
})
