import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawHitpaySubscriptionPlan,
} from '../../../../../../../src/verticals/payments/adapters/hitpay/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('hitpay transformPlan', () => {
  it('maps a monthly subscription plan correctly', () => {
    const raw: RawHitpaySubscriptionPlan = {
      id: 'plan-001',
      name: 'Pro Monthly',
      description: 'Monthly pro plan',
      cycle: 'monthly',
      cycle_repeat: 1,
      cycle_frequency: null,
      currency: 'SGD',
      amount: '29.99',
      reference: 'PRO-MONTHLY',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.interval).toBe('month')
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('SGD')
    expect(result.active).toBe(true)
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('hitpay')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly cycle to interval "year"', () => {
    const raw: RawHitpaySubscriptionPlan = {
      id: 'plan-002',
      name: 'Annual Plan',
      cycle: 'yearly',
      currency: 'USD',
      amount: '299.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(29900)
    expect(result.trialPeriodDays).toBe(0)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('defaults intervalCount to 1 when cycle_repeat is absent', () => {
    const raw: RawHitpaySubscriptionPlan = {
      id: 'plan-003',
      name: 'Weekly Plan',
      cycle: 'weekly',
      currency: 'SGD',
      amount: '9.99',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(result.intervalCount).toBe(1)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
