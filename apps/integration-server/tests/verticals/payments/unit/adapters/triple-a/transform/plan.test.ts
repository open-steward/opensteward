import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawStripePlan,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('triple-a transformPlan', () => {
  it('maps a weekly active plan', () => {
    const raw: RawStripePlan = {
      id: 'plan-ta-001',
      object: 'plan',
      product: 'prod-ta-001',
      nickname: 'Weekly Crypto',
      active: true,
      amount: 1000,
      currency: 'usd',
      interval: 'week',
      interval_count: 1,
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan-ta-001')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('week')
    expect(result.nickname).toBe('Weekly Crypto')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a monthly plan with trial period', () => {
    const raw: RawStripePlan = {
      id: 'plan-ta-002',
      object: 'plan',
      product: 'prod-ta-002',
      active: true,
      amount: 4900,
      currency: 'EUR',
      interval: 'month',
      trial_period_days: 7,
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('month')
    expect(result.trialPeriodDays).toBe(7)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
