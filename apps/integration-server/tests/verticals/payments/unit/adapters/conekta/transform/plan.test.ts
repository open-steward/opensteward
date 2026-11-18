import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawConektaPlan,
} from '../../../../../../../src/verticals/payments/adapters/conekta/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('conekta transformPlan', () => {
  it('maps a monthly plan with correct amount, currency and interval', () => {
    const raw: RawConektaPlan = {
      id: 'plan-001',
      name: 'Pro Monthly',
      amount: 19900,
      currency: 'MXN',
      interval: 'month',
      frequency: 1,
      trial_period_days: 14,
      created_at: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan-001')
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.amount).toBe(19900)
    expect(result.currency).toBe('MXN')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.trialPeriodDays).toBe(14)
    expect(result.gateway).toBe('conekta')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly plan to interval "year"', () => {
    const raw: RawConektaPlan = {
      id: 'plan-002',
      name: 'Annual',
      amount: 99900,
      currency: 'MXN',
      interval: 'year',
      frequency: 1,
      created_at: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(99900)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a weekly plan to interval "week"', () => {
    const raw: RawConektaPlan = {
      id: 'plan-003',
      amount: 5000,
      currency: 'MXN',
      interval: 'week',
      frequency: 1,
      created_at: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
