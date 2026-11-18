import { describe, it, expect } from 'vitest'
import {
  transformSubscriptionToOrder,
  untransformOrderToSubscription,
  type RawStayAiSubscription,
} from '../../../../../../../src/verticals/ecommerce/adapters/stay-ai/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeSubscription(overrides: Partial<RawStayAiSubscription> = {}): RawStayAiSubscription {
  return {
    id: 5001,
    shopifySubscriptionContractId: 8001,
    email: 'ada@example.com',
    phone: '+14155550101',
    customerId: 42,
    status: 'ACTIVE',
    currency: 'USD',
    lineItems: [
      {
        id: 'li-001',
        productId: 987654321,
        variantId: 111,
        title: 'Monthly Coffee Box',
        quantity: 1,
        price: '29.99',
        sku: 'COFFEE-BOX-M',
      },
    ],
    shippingAddress: {
      address1: '1 Computing Lane',
      address2: 'Suite 100',
      city: 'London',
      province: 'Greater London',
      provinceCode: 'GL',
      zip: 'EC1A 1BB',
      country: 'United Kingdom',
      countryCode: 'GB',
    },
    billingAddress: {
      address1: '1 Computing Lane',
      city: 'London',
      zip: 'EC1A 1BB',
      countryCode: 'GB',
    },
    nextBillingDate: '2024-07-01T00:00:00Z',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-06-01T08:00:00Z',
    cancelledAt: null,
    orderNotes: 'No milk alternatives',
    tags: ['vip', 'subscription'],
    ...overrides,
  }
}

describe('transformSubscriptionToOrder', () => {
  it('maps core fields', () => {
    const result = transformSubscriptionToOrder(makeSubscription())
    expect(result.id).toBe('5001')
    expect(result.orderNumber).toBe('8001')
    expect(result.email).toBe('ada@example.com')
    expect(result.phone).toBe('+14155550101')
    expect(result.customerId).toBe('42')
    expect(result.currency).toBe('USD')
  })

  it('maps ACTIVE status to PAID financial and UNFULFILLED fulfillment', () => {
    const result = transformSubscriptionToOrder(makeSubscription({ status: 'ACTIVE' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps PAUSED status to PENDING financial and UNFULFILLED fulfillment', () => {
    const result = transformSubscriptionToOrder(makeSubscription({ status: 'PAUSED' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps CANCELLED status to REFUNDED financial and RESTOCKED fulfillment', () => {
    const result = transformSubscriptionToOrder(makeSubscription({ status: 'CANCELLED' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps FAILED status to PARTIALLY_PAID financial', () => {
    const result = transformSubscriptionToOrder(makeSubscription({ status: 'FAILED' }))
    expect(result.financialStatus).toBe('PARTIALLY_PAID')
  })

  it('maps line items and converts price to minor units', () => {
    const result = transformSubscriptionToOrder(makeSubscription())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-001')
    expect(li.productId).toBe('987654321')
    expect(li.variantId).toBe('111')
    expect(li.title).toBe('Monthly Coffee Box')
    expect(li.quantity).toBe(1)
    // 29.99 USD → 2999 cents
    expect(li.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(li.sku).toBe('COFFEE-BOX-M')
  })

  it('maps shippingAddress', () => {
    const result = transformSubscriptionToOrder(makeSubscription())
    expect(result.shippingAddress?.line1).toBe('1 Computing Lane')
    expect(result.shippingAddress?.line2).toBe('Suite 100')
    expect(result.shippingAddress?.city).toBe('London')
    expect(result.shippingAddress?.postalCode).toBe('EC1A 1BB')
    expect(result.shippingAddress?.country).toBe('GB')
    expect(result.shippingAddress?.region).toBe('Greater London')
  })

  it('maps billingAddress', () => {
    const result = transformSubscriptionToOrder(makeSubscription())
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.billingAddress?.postalCode).toBe('EC1A 1BB')
  })

  it('maps note and tags', () => {
    const result = transformSubscriptionToOrder(makeSubscription())
    expect(result.note).toBe('No milk alternatives')
    expect(result.tags).toEqual(['vip', 'subscription'])
  })

  it('maps ISO string timestamps', () => {
    const result = transformSubscriptionToOrder(makeSubscription())
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-01T08:00:00.000Z')
  })

  it('maps epoch-ms number timestamps', () => {
    const epochMs = 1705315200000 // 2024-01-15T08:00:00.000Z
    const result = transformSubscriptionToOrder(makeSubscription({ createdAt: epochMs }))
    expect(result.createdAt).toBe(new Date(epochMs).toISOString())
  })

  it('maps cancelledAt', () => {
    const cancelTs = '2024-08-01T00:00:00Z'
    const result = transformSubscriptionToOrder(makeSubscription({ cancelledAt: cancelTs }))
    expect(result.cancelledAt).toBe('2024-08-01T00:00:00.000Z')
  })

  it('falls back to shopifySubscriptionContractId for id when id is null', () => {
    const result = transformSubscriptionToOrder(makeSubscription({ id: null }))
    expect(result.id).toBe('8001')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeSubscription()
    const result = transformSubscriptionToOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformSubscriptionToOrder(makeSubscription())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrderToSubscription', () => {
  it('maps note to orderNotes', () => {
    const result = untransformOrderToSubscription({ note: 'Extra ice' })
    expect(result['orderNotes']).toBe('Extra ice')
  })

  it('omits orderNotes when note is undefined', () => {
    const result = untransformOrderToSubscription({ email: 'test@example.com' })
    expect('orderNotes' in result).toBe(false)
  })

  it('round-trips note field', () => {
    const canonical = transformSubscriptionToOrder(makeSubscription())
    const body = untransformOrderToSubscription(canonical)
    expect(body['orderNotes']).toBe('No milk alternatives')
  })
})
