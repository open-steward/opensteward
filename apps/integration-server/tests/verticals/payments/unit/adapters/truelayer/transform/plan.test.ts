import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawStripePlan,
} from '../../../../../../../src/verticals/payments/adapters/truelayer/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('truelayer transformPlan', () => {
  it('maps a monthly plan with product reference', () => {
    const raw: RawStripePlan = {
      id: 'plan_tl_001',
      object: 'plan',
      product: 'prod_tl_001',
      nickname: 'Pro Monthly',
      active: true,
      amount: 9900,
      currency: 'usd',
      interval: 'month',
      interval_count: 1,
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan_tl_001')
    expect(result.productId).toBe('prod_tl_001')
    expect(result.interval).toBe('month')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly plan with trial period', () => {
    const raw: RawStripePlan = {
      id: 'plan_tl_002',
      object: 'plan',
      product: 'prod_tl_002',
      active: true,
      amount: 99000,
      currency: 'eur',
      interval: 'year',
      trial_period_days: 14,
      created: 1709337600,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.trialPeriodDays).toBe(14)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
