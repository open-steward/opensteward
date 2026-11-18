import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawFlutterwaveSubscription,
} from '../../../../../../../src/verticals/payments/adapters/flutterwave/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('flutterwave transformSubscription', () => {
  it('maps an active subscription with plan details', () => {
    const raw: RawFlutterwaveSubscription = {
      id: 401,
      status: 'active',
      amount: 29.99,
      customer: { id: 99, email: 'user@example.com', name: 'Test User' },
      plan: {
        id: 301,
        name: 'Pro Monthly',
        currency: 'NGN',
        interval: 'monthly',
        amount: 29.99,
      },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('401')
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('99')
    expect(result.currency).toBe('NGN')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.amount).toBe(2999)
    expect(result.items[0]!.priceId).toBe('301')
    expect(result.gateway).toBe('flutterwave')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "cancelled" status to "cancelled"', () => {
    const raw: RawFlutterwaveSubscription = {
      id: 402,
      status: 'cancelled',
      amount: 10.0,
      customer: { id: 100, email: 'x@x.com' },
      plan: { id: 302, currency: 'USD', interval: 'monthly', amount: 10.0 },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "non-renewing" status to "cancelled"', () => {
    const raw: RawFlutterwaveSubscription = {
      id: 403,
      status: 'non-renewing',
      amount: 5.0,
      customer: { id: 101 },
      plan: { id: 303, currency: 'NGN', interval: 'monthly', amount: 5.0 },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "canceled" (US spelling) to "cancelled"', () => {
    const raw: RawFlutterwaveSubscription = {
      id: 404,
      status: 'canceled',
      amount: 8.0,
      customer: { id: 102 },
      plan: { id: 304, currency: 'NGN', interval: 'weekly', amount: 8.0 },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('returns empty items array when plan is absent', () => {
    const raw: RawFlutterwaveSubscription = {
      id: 405,
      status: 'active',
      amount: 20.0,
      customer: { id: 103 },
      plan: null,
    }
    const result = transformSubscription(raw)
    expect(result.items).toHaveLength(0)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('stores plan_name and customer_email in metadata', () => {
    const raw: RawFlutterwaveSubscription = {
      id: 406,
      status: 'active',
      amount: 15.0,
      customer: { id: 104, email: 'meta@example.com' },
      plan: { id: 305, name: 'Meta Plan', currency: 'NGN', interval: 'monthly', amount: 15.0 },
    }
    const result = transformSubscription(raw)
    expect(result.metadata['plan_name']).toBe('Meta Plan')
    expect(result.metadata['customer_email']).toBe('meta@example.com')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
