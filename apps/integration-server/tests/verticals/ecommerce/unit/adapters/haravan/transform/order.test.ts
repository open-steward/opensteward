/**
 * Haravan Order transform — verified against
 * https://docs.haravan.com/docs/omni-apis/orders/ raw doc HTML: `currency` is
 * always present on the order (unlike products), `shipping_lines[]` (not a
 * single `total_shipping` field), and the misspelling-free
 * `financial_status`/`fulfillment_status` enums match Shopify's.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawHaravanOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/haravan/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawHaravanOrder> = {}): RawHaravanOrder {
  return {
    id: 1235924702,
    order_number: 2088,
    name: '#2088',
    currency: 'VND',
    customer: { id: 55 },
    email: 'buyer@haravan.com',
    subtotal_price: 200000,
    total_price: 215000,
    total_tax: 10000,
    total_discounts: 0,
    financial_status: 'authorized',
    fulfillment_status: 'unfulfilled',
    shipping_lines: [{ price: 15000 }],
    line_items: [
      { id: 901, product_id: 201, variant_id: 301, title: 'Ao thun', quantity: 2, price: 100000, sku: 'AO-001' },
    ],
    billing_address: { address1: '1 Nguyen Hue', city: 'HCMC', country_code: 'VN', zip: '700000' },
    tags: 'vip',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (haravan)', () => {
  it('maps id, orderNumber, name and customerId', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('1235924702')
    expect(result.orderNumber).toBe('2088')
    expect(result.customerId).toBe('55')
  })

  it('uses the order’s own currency, never a default', () => {
    const result = transformOrder(makeRaw({ currency: 'USD' }))
    expect(result.currency).toBe('USD')
    expect(result.totalPrice?.currency).toBe('USD')
  })

  it('maps financial and fulfillment status', () => {
    const result = transformOrder(makeRaw())
    expect(result.financialStatus).toBe('AUTHORIZED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('sums shipping_lines into totalShipping', () => {
    const result = transformOrder(makeRaw())
    expect(result.totalShipping).toEqual({ amount: 15000, currency: 'VND' })
  })

  it('maps line items and throws when a line item has no price', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems?.[0]!.quantity).toBe(2)
    expect(() =>
      transformOrder(
        makeRaw({ line_items: [{ id: 1, title: 'x', quantity: 1, price: undefined }] }),
      ),
    ).toThrow()
  })

  it('maps billingAddress and splits tags', () => {
    const result = transformOrder(makeRaw())
    expect(result.billingAddress?.line1).toBe('1 Nguyen Hue')
    expect(result.tags).toEqual(['vip'])
  })

  it('produces a payload that satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const body = untransformOrder(transformOrder(makeRaw()))
    expect(body['email']).toBe('buyer@haravan.com')
  })
})
