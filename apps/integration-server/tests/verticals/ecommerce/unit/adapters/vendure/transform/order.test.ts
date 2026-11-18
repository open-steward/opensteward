import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawVendureOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/vendure/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawVendureOrder> = {}): RawVendureOrder {
  return {
    id: '100',
    code: 'ORD-1001',
    state: 'PaymentSettled',
    customer: { id: '42', emailAddress: 'ada@example.com' },
    currencyCode: 'USD',
    subTotal: 10000, // $100.00
    subTotalWithTax: 10824,
    shipping: 499, // $4.99
    shippingWithTax: 599,
    total: 10499,
    totalWithTax: 11423, // $114.23
    billingAddress: {
      streetLine1: '1 Programming Ln',
      city: 'London',
      postalCode: 'NW1 2AB',
      countryCode: 'GB',
    },
    shippingAddress: {
      streetLine1: '1 Programming Ln',
      city: 'London',
      postalCode: 'NW1 2AB',
      countryCode: 'GB',
    },
    lines: [
      {
        id: 'LINE1',
        productVariant: { id: 'V1', name: 'Laptop Stand - Silver', sku: 'LS-SILVER', product: { id: 'P1' } },
        quantity: 2,
        unitPrice: 4999,
        unitPriceWithTax: 5412,
      },
    ],
    fulfillments: [{ id: 'F1', state: 'Shipped', trackingCode: '1Z999' }],
    couponCodes: ['SAVE5'],
    payments: [{ id: 'PAY1', method: 'stripe', amount: 11423, state: 'Settled' }],
    createdAt: '2024-05-01T10:00:00Z',
    updatedAt: '2024-05-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (Vendure)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('100')
    expect(result.orderNumber).toBe('ORD-1001')
    expect(result.customerId).toBe('42')
    expect(result.email).toBe('ada@example.com')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 11423, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 599, currency: 'USD' })
  })

  it('maps Vendure order states', () => {
    expect(transformOrder(makeOrder({ state: 'PaymentSettled' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ state: 'PaymentSettled' })).fulfillmentStatus).toBe('UNFULFILLED')
    expect(transformOrder(makeOrder({ state: 'PaymentAuthorized' })).financialStatus).toBe('AUTHORIZED')
    expect(transformOrder(makeOrder({ state: 'Shipped' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ state: 'PartiallyShipped' })).fulfillmentStatus).toBe('PARTIAL')
    expect(transformOrder(makeOrder({ state: 'Delivered' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ state: 'Cancelled' })).financialStatus).toBe('VOIDED')
    expect(transformOrder(makeOrder({ state: 'AddingItems' })).financialStatus).toBe('PENDING')
    expect(transformOrder(makeOrder({ state: 'ArrangingPayment' })).financialStatus).toBe('PENDING')
  })

  it('maps nested line items with cents conversion', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('LINE1')
    expect(li.productId).toBe('P1')
    expect(li.variantId).toBe('V1')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 5412, currency: 'USD' })
  })

  it('maps addresses and fulfillment ids', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toEqual(['F1'])
    expect(result.discountCodes).toEqual(['SAVE5'])
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.shippingAddress?.postalCode).toBe('NW1 2AB')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
