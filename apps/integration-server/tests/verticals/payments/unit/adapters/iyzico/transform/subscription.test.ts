import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawIyzicoSubscription,
} from '../../../../../../../src/verticals/payments/adapters/iyzico/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('iyzico transformSubscription', () => {
  it('maps subscriptionStatus ACTIVE to "active" with items', () => {
    const raw: RawIyzicoSubscription = {
      referenceCode: 'sub-001',
      customerReferenceCode: 'cust-ref-001',
      subscriptionStatus: 'ACTIVE',
      pricingPlanReferenceCode: 'plan-ref-001',
      startDate: '2024-03-01T00:00:00Z',
      endDate: '2024-04-01T00:00:00Z',
      orders: [{ referenceCode: 'order-1', price: 99.0, currencyCode: 'TRY', status: 'SUCCESS' }],
      createdDate: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.id).toBe('sub-001')
    expect(result.customerId).toBe('cust-ref-001')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].priceId).toBe('plan-ref-001')
    expect(result.currency).toBe('TRY')
    expect(result.gateway).toBe('iyzico')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps subscriptionStatus CANCELED to "cancelled"', () => {
    const raw: RawIyzicoSubscription = {
      referenceCode: 'sub-002',
      customerReferenceCode: 'cust-ref-002',
      subscriptionStatus: 'CANCELED',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps subscriptionStatus UNPAID to "past_due"', () => {
    const raw: RawIyzicoSubscription = {
      referenceCode: 'sub-003',
      customerReferenceCode: 'cust-ref-003',
      subscriptionStatus: 'UNPAID',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps subscriptionStatus EXPIRED to "expired"', () => {
    const raw: RawIyzicoSubscription = {
      referenceCode: 'sub-004',
      customerReferenceCode: 'cust-ref-004',
      subscriptionStatus: 'EXPIRED',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
