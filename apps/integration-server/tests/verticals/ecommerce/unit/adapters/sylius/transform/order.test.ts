import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawSyliusOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/sylius/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawSyliusOrder> = {}): RawSyliusOrder {
  return {
    id: 500,
    number: '000000042',
    state: 'fulfilled',
    paymentState: 'paid',
    shippingState: 'shipped',
    customer: { id: 10, email: 'alice@example.com' },
    currencyCode: 'USD',
    itemsTotal: 4998, // $49.98 in cents
    total: 5993, // $59.93 in cents
    shippingTotal: 500, // $5.00
    taxTotal: 495, // $4.95
    orderPromotionTotal: -500, // -$5.00
    items: [
      {
        id: 1001,
        productName: 'Blue Mug (Small)',
        variantCode: 'MUG_BLUE_S',
        quantity: 2,
        unitPrice: 999, // $9.99 in cents
      },
    ],
    notes: 'Leave at door',
    billingAddress: {
      firstName: 'Alice',
      lastName: 'Johnson',
      street: '456 Oak Ave',
      city: 'Seattle',
      provinceName: 'Washington',
      postcode: '98101',
      countryCode: 'US',
    },
    shippingAddress: {
      firstName: 'Alice',
      lastName: 'Johnson',
      street: '456 Oak Ave',
      city: 'Seattle',
      provinceName: 'Washington',
      postcode: '98101',
      countryCode: 'US',
    },
    checkoutCompletedAt: '2024-02-20T15:00:00Z',
    createdAt: '2024-02-20T14:00:00Z',
    updatedAt: '2024-02-20T15:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (Sylius)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('500')
    expect(result.orderNumber).toBe('000000042')
    expect(result.name).toBe('#000000042')
    expect(result.customerId).toBe('10')
    expect(result.email).toBe('alice@example.com')
    expect(result.currency).toBe('USD')
  })

  it('converts cents to decimal for money fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 4998, currency: 'USD' })
    expect(result.totalPrice).toEqual({ amount: 5993, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 495, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps financial status from paymentState', () => {
    expect(transformOrder(makeOrder({ paymentState: 'paid' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ paymentState: 'awaiting_payment' })).financialStatus).toBe('PENDING')
    expect(transformOrder(makeOrder({ paymentState: 'partially_paid' })).financialStatus).toBe('PARTIALLY_PAID')
    expect(transformOrder(makeOrder({ paymentState: 'partially_refunded' })).financialStatus).toBe('PARTIALLY_REFUNDED')
    expect(transformOrder(makeOrder({ paymentState: 'refunded' })).financialStatus).toBe('REFUNDED')
    expect(transformOrder(makeOrder({ paymentState: 'cancelled' })).financialStatus).toBe('VOIDED')
  })

  it('maps fulfillment status from shippingState', () => {
    expect(transformOrder(makeOrder({ shippingState: 'shipped' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ shippingState: 'ready' })).fulfillmentStatus).toBe('UNFULFILLED')
    expect(transformOrder(makeOrder({ shippingState: 'partially_shipped' })).fulfillmentStatus).toBe('PARTIAL')
    expect(transformOrder(makeOrder({ shippingState: 'cancelled' })).fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps cancelled order state to RESTOCKED', () => {
    const result = transformOrder(makeOrder({ state: 'cancelled', shippingState: 'ready' }))
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps line items with cents-to-decimal conversion', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1001')
    expect(li.variantId).toBe('MUG_BLUE_S')
    expect(li.title).toBe('Blue Mug (Small)')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 999, currency: 'USD' })
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('456 Oak Ave')
    expect(result.shippingAddress?.city).toBe('Seattle')
  })

  it('extracts customer ID from IRI string', () => {
    const result = transformOrder(makeOrder({ customer: '/api/v2/admin/customers/42' }))
    expect(result.customerId).toBe('42')
  })

  it('handles null customer', () => {
    const result = transformOrder(makeOrder({ customer: null }))
    expect(result.customerId).toBeUndefined()
    expect(result.email).toBeUndefined()
  })

  it('maps note and dates', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Leave at door')
    expect(result.processedAt).toBe('2024-02-20T15:00:00Z')
    expect(result.cancelledAt).toBeUndefined()
  })

  it('sets cancelledAt from updatedAt when state is cancelled', () => {
    const result = transformOrder(makeOrder({ state: 'cancelled' }))
    expect(result.cancelledAt).toBe('2024-02-20T15:00:00Z')
  })

  it('preserves metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
