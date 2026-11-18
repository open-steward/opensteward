import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawChargebeePlan,
} from '../../../../../../../src/verticals/payments/adapters/chargebee/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

const baseRaw: RawChargebeePlan = {
  id: 'plan_monthly',
  name: 'Pro Monthly',
  status: 'active',
  price: 1999,
  currency_code: 'USD',
  period: 1,
  period_unit: 'month',
  trial_period: 14,
  trial_period_unit: 'day',
  created_at: 1709251200, // 2024-03-01T00:00:00Z
  updated_at: 1709251200,
}

describe('chargebee transformPlan', () => {
  it('maps status "active" to active = true', () => {
    const result = transformPlan(baseRaw)
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('chargebee')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('surfaces amount, currency, and interval', () => {
    const result = transformPlan(baseRaw)
    expect(result.amount).toBe(1999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps trial_period (days) to trialPeriodDays', () => {
    const result = transformPlan(baseRaw)
    expect(result.trialPeriodDays).toBe(14)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('converts weekly trial period to days (×7)', () => {
    const result = transformPlan({ ...baseRaw, trial_period: 2, trial_period_unit: 'week' })
    expect(result.trialPeriodDays).toBe(14)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps status "archived" to active = false', () => {
    const result = transformPlan({ ...baseRaw, status: 'archived' })
    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps period_unit "year" to interval "year"', () => {
    const result = transformPlan({ ...baseRaw, period_unit: 'year' })
    expect(result.interval).toBe('year')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('converts Unix-second created_at to ISO string', () => {
    const result = transformPlan(baseRaw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
