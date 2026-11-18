import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawPinSubscription,
} from '../../../../../../../src/verticals/payments/adapters/pin-payments/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('pin-payments transformSubscription', () => {
  it('maps state "active" to status "active" with period dates', () => {
    const raw: RawPinSubscription = {
      token: 'sub_active',
      customer_token: 'cus_abc',
      state: 'active',
      plan: { currency: 'AUD' },
      active_interval_started_at: '2024-03-01T00:00:00Z',
      active_interval_finishes_at: '2024-04-01T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.id).toBe('sub_active')
    expect(result.customerId).toBe('cus_abc')
    expect(result.currency).toBe('AUD')
    expect(result.currentPeriodStart).toBe('2024-03-01T00:00:00Z')
    expect(result.currentPeriodEnd).toBe('2024-04-01T00:00:00Z')
    expect(result.items).toEqual([])
    expect(result.gateway).toBe('pin-payments')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps state "trial" to status "trialing"', () => {
    const raw: RawPinSubscription = {
      token: 'sub_trial',
      customer_token: 'cus_trial',
      state: 'trial',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('trialing')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps state "cancelled" to status "cancelled"', () => {
    const raw: RawPinSubscription = {
      token: 'sub_cancel',
      customer_token: 'cus_cancel',
      state: 'cancelled',
      cancelled_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBe('2024-03-01T00:00:00Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps state "past_due" to status "past_due"', () => {
    const raw: RawPinSubscription = {
      token: 'sub_pastdue',
      customer_token: 'cus_pd',
      state: 'past_due',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to AUD from nested plan', () => {
    const raw: RawPinSubscription = {
      token: 'sub_cur',
      customer_token: 'cus_cur',
      state: 'active',
      plan: { currency: 'AUD' },
    }
    const result = transformSubscription(raw)
    expect(result.currency).toBe('AUD')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
