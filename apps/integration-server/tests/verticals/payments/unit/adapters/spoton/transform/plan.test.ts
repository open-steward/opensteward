import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawStripePlan,
} from '../../../../../../../src/verticals/payments/adapters/spoton/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('spoton transformPlan', () => {
  it('maps an active monthly plan', () => {
    const raw: RawStripePlan = {
      id: 'plan_spoton_1',
      object: 'plan',
      product: 'prod_1',
      nickname: 'Pro Monthly',
      active: true,
      amount: 2999,
      currency: 'usd',
      interval: 'month',
      interval_count: 1,
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan_spoton_1')
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.active).toBe(true)
    expect(result.productId).toBe('prod_1')
    expect(result.gateway).toBe('stripe')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly plan with trial days', () => {
    const raw: RawStripePlan = {
      id: 'plan_spoton_2',
      object: 'plan',
      active: true,
      amount: 29900,
      currency: 'eur',
      interval: 'year',
      interval_count: 1,
      trial_period_days: 14,
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.trialPeriodDays).toBe(14)
    expect(result.currency).toBe('EUR')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('defaults amount to 0 when absent', () => {
    const raw: RawStripePlan = {
      id: 'plan_spoton_3',
      object: 'plan',
      currency: 'usd',
      interval: 'month',
    }
    const result = transformPlan(raw)
    expect(result.amount).toBe(0)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
