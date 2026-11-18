import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawStripePlan,
} from '../../../../../../../src/verticals/payments/adapters/payoneer/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('payoneer transformPlan', () => {
  it('maps a monthly active plan', () => {
    const raw: RawStripePlan = {
      id: 'plan_001',
      object: 'plan',
      product: 'prod_001',
      nickname: 'Pro Monthly',
      active: true,
      amount: 9900,
      currency: 'usd',
      interval: 'month',
      interval_count: 1,
      trial_period_days: 14,
      created: 1709251200,
    }

    const result = transformPlan(raw)

    expect(result.id).toBe('plan_001')
    expect(result.productId).toBe('prod_001')
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.trialPeriodDays).toBe(14)
    expect(result.gateway).toBe('stripe')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly plan and uppercases currency', () => {
    const raw: RawStripePlan = {
      id: 'plan_002',
      object: 'plan',
      active: false,
      amount: 99900,
      currency: 'eur',
      interval: 'year',
      created: 1709251200,
    }

    const result = transformPlan(raw)

    expect(result.interval).toBe('year')
    expect(result.currency).toBe('EUR')
    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
