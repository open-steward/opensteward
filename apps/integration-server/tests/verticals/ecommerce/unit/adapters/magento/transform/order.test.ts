import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawMagentoOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/magento/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawMagentoOrder> = {}): RawMagentoOrder {
  return {
    entity_id: 1001,
    increment_id: '000000123',
    status: 'complete',
    state: 'complete',
    customer_id: 7001,
    customer_email: 'ada@example.com',
    customer_firstname: 'Ada',
    customer_lastname: 'Lovelace',
    order_currency_code: 'USD',
    base_currency_code: 'USD',
    grand_total: 108.24,
    subtotal: 100.0,
    tax_amount: 8.25,
    discount_amount: -5.0,
    shipping_amount: 4.99,
    total_paid: 108.24,
    created_at: '2024-05-01T10:00:00.000Z',
    updated_at: '2024-05-01T12:00:00.000Z',
    customer_note: 'Gift wrap please',
    coupon_code: 'SAVE5',
    items: [
      {
        item_id: 9001,
        sku: 'TEE-OCEAN-BLUE-S',
        name: 'Ocean Blue T-Shirt - Blue / S',
        product_id: 201,
        product_type: 'simple',
        price: 49.99,
        qty_ordered: 2,
        qty_shipped: 2,
        row_total: 99.98,
        discount_amount: 0,
      },
    ],
    billing_address: {
      address_type: 'billing',
      city: 'London',
      country_id: 'GB',
      email: 'ada@example.com',
      firstname: 'Ada',
      lastname: 'Lovelace',
      postcode: 'NW1 2AB',
      region: 'England',
      street: ['1 Programming Ln'],
      telephone: '+44 20 7946 0000',
    },
    extension_attributes: {
      shipping_assignments: [
        {
          shipping: {
            method: 'flatrate_flatrate',
            address: {
              address_type: 'shipping',
              city: 'London',
              country_id: 'GB',
              firstname: 'Ada',
              lastname: 'Lovelace',
              postcode: 'NW1 2AB',
              region: 'England',
              street: ['1 Programming Ln'],
              telephone: '+44 20 7946 0000',
            },
          },
          items: [],
        },
      ],
    },
    ...overrides,
  }
}

describe('transformOrder (Magento)', () => {
  it('maps core fields and splits status into canonical pair', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('000000123')
    expect(result.name).toBe('#000000123')
    expect(result.customerId).toBe('7001')
    expect(result.email).toBe('ada@example.com')
    expect(result.currency).toBe('USD')
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
    expect(result.totalPrice).toEqual({ amount: 10824, currency: 'USD' })
  })

  it('maps line items with unit price and sku', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.productId).toBe('201')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(li.sku).toBe('TEE-OCEAN-BLUE-S')
  })

  it('maps shipping and billing addresses from different paths', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toMatchObject({
      line1: '1 Programming Ln',
      city: 'London',
      country: 'GB',
    })
    expect(result.shippingAddress).toMatchObject({
      line1: '1 Programming Ln',
      city: 'London',
      country: 'GB',
    })
  })

  it('covers every Magento status → canonical pair mapping', () => {
    const cases: Array<[
      RawMagentoOrder['status'],
      string | undefined,
      string | undefined,
    ]> = [
      ['pending', 'PENDING', 'UNFULFILLED'],
      ['pending_payment', 'PENDING', 'UNFULFILLED'],
      ['holded', 'PENDING', 'UNFULFILLED'],
      ['processing', 'PAID', 'UNFULFILLED'],
      ['complete', 'PAID', 'FULFILLED'],
      ['canceled', 'VOIDED', 'UNFULFILLED'],
      ['closed', 'REFUNDED', 'UNFULFILLED'],
    ]
    for (const [status, fin, ful] of cases) {
      const r = transformOrder(makeOrder({ status }))
      expect(r.financialStatus).toBe(fin)
      expect(r.fulfillmentStatus).toBe(ful)
    }
  })

  it('preserves raw payload in metadata and validates against OrderSchema', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const body = untransformOrder(canonical) as { entity: Record<string, unknown> }
    expect(body.entity['increment_id']).toBe('000000123')
    expect(body.entity['customer_email']).toBe('ada@example.com')
    expect(body.entity['customer_note']).toBe('Gift wrap please')
  })
})
