import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawStripePlan,
} from '../../../../../../../src/verticals/payments/adapters/yapily/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('yapily transformPlan (stripe-scaffold)', () => {
  it('maps an active monthly plan', () => {
    const raw: RawStripePlan = {
      id: 'plan-001',
      object: 'plan',
      product: 'prod-001',
      nickname: 'Monthly Pro',
      active: true,
      amount: 5000,
      currency: 'usd',
      interval: 'month',
      interval_count: 1,
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(true)
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.nickname).toBe('Monthly Pro')
    expect(result.gateway).toBe('stripe')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly plan with trial days', () => {
    const raw: RawStripePlan = {
      id: 'plan-002',
      object: 'plan',
      active: true,
      amount: 50000,
      currency: 'gbp',
      interval: 'year',
      interval_count: 1,
      trial_period_days: 14,
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.trialPeriodDays).toBe(14)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
