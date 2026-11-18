import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawPayPalSubscription,
} from '../../../../../../../src/verticals/payments/adapters/paypal/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('paypal transformSubscription', () => {
  it('maps an ACTIVE subscription with subscriber payer_id', () => {
    const raw: RawPayPalSubscription = {
      id: 'SUB-001',
      status: 'ACTIVE',
      plan_id: 'PLAN-001',
      subscriber: { payer_id: 'PAYER123', email_address: 'user@example.com' },
      billing_info: {
        next_billing_time: '2024-07-01T00:00:00Z',
        last_payment: {
          amount: { value: '9.99', currency_code: 'USD' },
          time: '2024-06-01T00:00:00Z',
        },
      },
      create_time: '2024-01-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('SUB-001')
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('PAYER123')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.priceId).toBe('PLAN-001')
    expect(result.currentPeriodEnd).toBe('2024-07-01T00:00:00Z')
    expect(result.gateway).toBe('paypal')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED subscription', () => {
    const raw: RawPayPalSubscription = {
      id: 'SUB-002',
      status: 'CANCELLED',
      subscriber: { payer_id: 'PAYER456' },
      create_time: '2024-01-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.items).toHaveLength(0)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a SUSPENDED subscription to "paused"', () => {
    const raw: RawPayPalSubscription = {
      id: 'SUB-003',
      status: 'SUSPENDED',
      subscriber: { email_address: 'x@example.com' },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(result.customerId).toBe('x@example.com')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
