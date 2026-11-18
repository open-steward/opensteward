import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawOpenCartOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/opencart/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawOpenCartOrder> = {}): RawOpenCartOrder {
  return {
    order_id: 1001,
    invoice_no: '1001',
    invoice_prefix: 'INV-',
    order_status_id: 5,
    order_status: 'Complete',
    customer_id: 101,
    email: 'grace@example.com',
    telephone: '+1 555 000 2222',
    currency_code: 'USD',
    comment: 'Please deliver quickly',
    total: '108.24',
    payment_address_1: '1 Navy Yard',
    payment_city: 'Arlington',
    payment_zone: 'Virginia',
    payment_postcode: '22202',
    payment_country: 'US',
    payment_method: 'Credit Card',
    shipping_address_1: '1 Navy Yard',
    shipping_city: 'Arlington',
    shipping_zone: 'Virginia',
    shipping_postcode: '22202',
    shipping_country: 'US',
    products: [
      {
        order_product_id: 9001,
        product_id: 42,
        name: 'Wireless Mouse',
        model: 'WM-100',
        quantity: 2,
        price: '29.99',
        total: '59.98',
      },
    ],
    totals: [
      { code: 'sub_total', title: 'Sub-Total', value: '59.98' },
      { code: 'shipping', title: 'Flat Shipping Rate', value: '5.00' },
      { code: 'tax', title: 'VAT (20%)', value: '12.00' },
      { code: 'total', title: 'Total', value: '108.24' },
    ],
    date_added: '2024-05-01T10:00:00.000Z',
    date_modified: '2024-05-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrder (OpenCart)', () => {
  it('maps core fields and splits status into canonical pair', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('INV-1001')
    expect(result.customerId).toBe('101')
    expect(result.email).toBe('grace@example.com')
    expect(result.currency).toBe('USD')
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
    expect(result.totalPrice).toEqual({ amount: 10824, currency: 'USD' })
  })

  it('extracts subtotal, shipping, and tax from totals array', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 5998, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 1200, currency: 'USD' })
  })

  it('maps line items with unit price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.productId).toBe('42')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(li.sku).toBe('WM-100')
  })

  it('covers key OpenCart status_id → canonical pair mappings', () => {
    const cases: Array<[
      number,
      string | undefined,
      string | undefined,
    ]> = [
      [1, 'PENDING', 'UNFULFILLED'],
      [2, 'PAID', 'UNFULFILLED'],
      [3, 'PAID', 'FULFILLED'],
      [5, 'PAID', 'FULFILLED'],
      [7, 'VOIDED', 'UNFULFILLED'],
      [10, 'VOIDED', 'UNFULFILLED'],
      [11, 'REFUNDED', 'UNFULFILLED'],
      [15, 'PAID', 'UNFULFILLED'],
    ]
    for (const [statusId, fin, ful] of cases) {
      const r = transformOrder(makeOrder({ order_status_id: statusId }))
      expect(r.financialStatus).toBe(fin)
      expect(r.fulfillmentStatus).toBe(ful)
    }
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('1 Navy Yard')
    expect(result.billingAddress?.country).toBe('US')
    expect(result.shippingAddress?.line1).toBe('1 Navy Yard')
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
    expect(body['currency_code']).toBe('USD')
    expect(body['comment']).toBe('Please deliver quickly')
    expect(body['payment_address_1']).toBe('1 Navy Yard')
    expect(body['payment_country']).toBe('US')
  })
})
