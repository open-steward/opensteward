import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawStripePlan,
} from '../../../../../../../src/verticals/payments/adapters/bridge-open-banking/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('bridge-open-banking transformPlan', () => {
  it('maps a monthly plan', () => {
    const raw: RawStripePlan = {
      id: 'plan-001',
      object: 'plan',
      product: 'prod-001',
      nickname: 'Monthly Basic',
      active: true,
      amount: 999,
      currency: 'usd',
      interval: 'month',
      interval_count: 1,
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan-001')
    expect(result.productId).toBe('prod-001')
    expect(result.nickname).toBe('Monthly Basic')
    expect(result.amount).toBe(999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('stripe')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly plan with trial', () => {
    const raw: RawStripePlan = {
      id: 'plan-002',
      object: 'plan',
      product: 'prod-002',
      active: true,
      amount: 9999,
      currency: 'eur',
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
