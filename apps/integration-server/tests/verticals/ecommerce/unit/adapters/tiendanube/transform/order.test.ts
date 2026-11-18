import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawTiendanubeOrder,
  type RawTiendanubeOrderProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiendanube/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeProduct(
  overrides: Partial<RawTiendanubeOrderProduct> = {},
): RawTiendanubeOrderProduct {
  return {
    id: 101,
    product_id: 50,
    variant_id: 200,
    name: 'Blue T-Shirt',
    price: '29.99',
    quantity: 2,
    sku: 'TSHIRT-BLU',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawTiendanubeOrder> = {}): RawTiendanubeOrder {
  return {
    id: 1042,
    number: 1042,
    currency: 'USD',
    payment_status: 'paid',
    shipping_status: 'shipped',
    contact_email: 'jane@example.com',
    contact_phone: '+14155550123',
    subtotal: '59.98',
    discount: '0.00',
    total: '59.98',
    billing_address: '123 Main St',
    billing_number: '4B',
    billing_city: 'New York',
    billing_province: 'NY',
    billing_zipcode: '10001',
    billing_country: 'US',
    shipping_address: {
      address: '456 Ship Rd',
      city: 'Brooklyn',
      zipcode: '11201',
      country: 'US',
    },
    products: [makeProduct()],
    coupon: [{ code: 'SAVE10' }],
    customer: { id: 77, name: 'Jane Doe', email: 'jane@example.com' },
    note: 'Leave at door',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformOrder (Tiendanube)', () => {
  it('maps core id, orderNumber, email and currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1042')
    expect(result.orderNumber).toBe('1042')
    expect(result.email).toBe('jane@example.com')
    expect(result.currency).toBe('USD')
  })

  it('converts total price from major-unit string to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 5998, currency: 'USD' })
  })

  it('maps payment_status to financialStatus', () => {
    expect(transformOrder(makeOrder({ payment_status: 'paid' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ payment_status: 'pending' })).financialStatus).toBe('PENDING')
    expect(transformOrder(makeOrder({ payment_status: 'refunded' })).financialStatus).toBe(
      'REFUNDED',
    )
    expect(transformOrder(makeOrder({ payment_status: 'abandoned' })).financialStatus).toBe(
      'PENDING',
    )
  })

  it('maps shipping_status to fulfillmentStatus', () => {
    expect(transformOrder(makeOrder({ shipping_status: 'shipped' })).fulfillmentStatus).toBe(
      'FULFILLED',
    )
    expect(transformOrder(makeOrder({ shipping_status: 'unpacked' })).fulfillmentStatus).toBe(
      'UNFULFILLED',
    )
    expect(transformOrder(makeOrder({ shipping_status: 'packed' })).fulfillmentStatus).toBe(
      'PARTIAL',
    )
    expect(transformOrder(makeOrder({ shipping_status: 'returned' })).fulfillmentStatus).toBe(
      'RESTOCKED',
    )
  })

  it('maps line items from products array', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('101')
    expect(li.productId).toBe('50')
    expect(li.variantId).toBe('200')
    expect(li.title).toBe('Blue T-Shirt')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(li.sku).toBe('TSHIRT-BLU')
  })

  it('maps flat billing address', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress!.line1).toBe('123 Main St 4B')
    expect(result.billingAddress!.city).toBe('New York')
    expect(result.billingAddress!.country).toBe('US')
  })

  it('maps nested shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toBeDefined()
    expect(result.shippingAddress!.line1).toBe('456 Ship Rd')
    expect(result.shippingAddress!.city).toBe('Brooklyn')
  })

  it('maps coupon codes to discountCodes', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE10'])
  })

  it('maps customerId from customer.id', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('77')
  })

  it('maps note and timestamps', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Leave at door')
    expect(result.createdAt).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updatedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const order = transformOrder(makeOrder())
    const body = untransformOrder(order)
    expect(body['contact_email']).toBe('jane@example.com')
    expect(body['currency']).toBe('USD')
    expect(body['note']).toBe('Leave at door')
  })
})
