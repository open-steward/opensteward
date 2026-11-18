import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawPaystackSubscription,
} from '../../../../../../../src/verticals/payments/adapters/paystack/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('paystack transformSubscription', () => {
  it('maps an active subscription with plan and customer', () => {
    const raw: RawPaystackSubscription = {
      id: 501,
      subscription_code: 'SUB_code001',
      status: 'active',
      quantity: 1,
      amount: 99900,
      currency: 'NGN',
      plan: { id: 401, plan_code: 'PLN_monthly001', currency: 'NGN', interval: 'monthly' },
      customer: { id: 42, customer_code: 'CUS_cust001', email: 'buyer@example.com' },
      next_payment_date: '2024-04-01T00:00:00Z',
      start: '2024-03-01T00:00:00Z',
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('CUS_cust001')
    expect(result.currency).toBe('NGN')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].priceId).toBe('PLN_monthly001')
    expect(result.currentPeriodStart).toBe('2024-03-01T00:00:00Z')
    expect(result.currentPeriodEnd).toBe('2024-04-01T00:00:00Z')
    expect(result.gateway).toBe('paystack')
    expect(result.id).toBe('501')
    expect(result.externalId).toBe('SUB_code001')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a non-renewing subscription to status "cancelled"', () => {
    const raw: RawPaystackSubscription = {
      id: 502,
      subscription_code: 'SUB_code002',
      status: 'non-renewing',
      amount: 99900,
      currency: 'NGN',
      customer: { id: 43, customer_code: 'CUS_cust002' },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.items).toHaveLength(0)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps an attention subscription to status "past_due"', () => {
    const raw: RawPaystackSubscription = {
      id: 503,
      subscription_code: 'SUB_code003',
      status: 'attention',
      amount: 50000,
      currency: 'NGN',
      customer: { id: 44, customer_code: 'CUS_cust003' },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
