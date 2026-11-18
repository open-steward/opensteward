/**
 * ePages Beyond Order ↔ canonical Order.
 * Docs: https://api-docs.beyondshop.cloud/ng-order-order-public-api.html
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawEpagesOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/epages/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawEpagesOrder> = {}): RawEpagesOrder {
  return {
    _id: 'o1',
    orderNumber: '1000',
    paymentStatus: 'PAID',
    shippingStatus: 'UNSHIPPED',
    currency: 'EUR',
    subtotal: { amount: 19.99, currency: 'EUR' },
    taxTotal: { amount: 3.8, currency: 'EUR' },
    grandTotal: { amount: 23.79, currency: 'EUR' },
    productLineItems: [
      {
        _id: 'li1',
        quantity: 2,
        product: { _id: 'p1', sku: 'SKU-1', name: 'Wireless Keyboard' },
        unitPrice: { amount: 19.99, currency: 'EUR' },
      },
    ],
    billingAddress: { firstName: 'Jane', lastName: 'Doe', street: 'Market Street', houseNumber: '2500', postalCode: '94114', city: 'SF', state: 'CA', country: 'US' },
    customerEmail: 'jane@example.com',
    customerId: 'c1',
    createdAt: '2026-09-09T10:54:33.437',
    updatedAt: '2026-09-09T10:54:33.437',
    ...overrides,
  }
}

describe('transformOrder (ePages Beyond)', () => {
  it('maps core fields, converting decimal totals to integer minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('o1')
    expect(result.orderNumber).toBe('1000')
    expect(result.customerId).toBe('c1')
    expect(result.email).toBe('jane@example.com')
    expect(result.totalPrice).toEqual({ amount: 2379, currency: 'EUR' })
    expect(result.subtotalPrice).toEqual({ amount: 1999, currency: 'EUR' })
  })

  it('maps known payment/shipping statuses', () => {
    expect(transformOrder(makeOrder({ paymentStatus: 'PAID' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ paymentStatus: 'PENDING' })).financialStatus).toBe('PENDING')
    expect(transformOrder(makeOrder({ shippingStatus: 'SHIPPED' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ shippingStatus: 'UNSHIPPED' })).fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps an unfaithful status to unknown rather than a nearby-but-wrong enum value', () => {
    expect(transformOrder(makeOrder({ paymentStatus: 'REFUND_PENDING' })).financialStatus).toBe('unknown')
    expect(transformOrder(makeOrder({ shippingStatus: 'CANCELED' })).fulfillmentStatus).toBe('unknown')
  })

  it('maps productLineItems to canonical lineItems', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li1')
    expect(li.productId).toBe('p1')
    expect(li.title).toBe('Wireless Keyboard')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 1999, currency: 'EUR' })
  })

  it('throws when a line item has no unitPrice, rather than inventing one', () => {
    const order = makeOrder({
      productLineItems: [{ _id: 'li2', quantity: 1, product: { name: 'X' } }],
    })
    expect(() => transformOrder(order)).toThrow(/has no unitPrice/)
  })

  it('maps address fields onto AddressSchema field names', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toEqual({
      line1: 'Market Street 2500',
      city: 'SF',
      region: 'CA',
      postalCode: '94114',
      country: 'US',
    })
  })

  it('normalises the offset-less timestamp to strict ISO 8601', () => {
    expect(transformOrder(makeOrder()).createdAt).toBe('2026-09-09T10:54:33.437Z')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})
