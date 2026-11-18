import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawPinPlan,
} from '../../../../../../../src/verticals/payments/adapters/pin-payments/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('pin-payments transformPlan', () => {
  it('maps a monthly plan with trial period', () => {
    const raw: RawPinPlan = {
      token: 'plan_monthly',
      name: 'Monthly Pro',
      amount: 999,
      currency: 'AUD',
      interval_unit: 'month',
      interval: 1,
      trial_interval: 14,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan_monthly')
    expect(result.nickname).toBe('Monthly Pro')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.trialPeriodDays).toBe(14)
    expect(result.active).toBe(true)
    expect(result.amount).toBe(999)
    expect(result.currency).toBe('AUD')
    expect(result.gateway).toBe('pin-payments')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps interval_unit "day" to interval "day"', () => {
    const raw: RawPinPlan = {
      token: 'plan_day',
      interval_unit: 'day',
      interval: 1,
      amount: 100,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('day')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps interval_unit "week" to interval "week"', () => {
    const raw: RawPinPlan = {
      token: 'plan_week',
      interval_unit: 'week',
      amount: 200,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps interval_unit "year" to interval "year"', () => {
    const raw: RawPinPlan = {
      token: 'plan_year',
      interval_unit: 'year',
      amount: 9999,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('omits trialPeriodDays when trial_interval is 0', () => {
    const raw: RawPinPlan = {
      token: 'plan_notrial',
      interval_unit: 'month',
      amount: 500,
      trial_interval: 0,
    }
    const result = transformPlan(raw)
    expect(result.trialPeriodDays).toBeUndefined()
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('falls back intervalCount to 1 when interval is absent', () => {
    const raw: RawPinPlan = {
      token: 'plan_fallback',
      amount: 300,
    }
    const result = transformPlan(raw)
    expect(result.intervalCount).toBe(1)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
