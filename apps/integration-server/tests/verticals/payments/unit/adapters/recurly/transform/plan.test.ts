import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawRecurlyPlan,
} from '../../../../../../../src/verticals/payments/adapters/recurly/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('recurly transformPlan', () => {
  it('maps an active monthly plan correctly', () => {
    const raw: RawRecurlyPlan = {
      id: 'plan-001',
      code: 'pro-monthly',
      name: 'Pro Monthly',
      state: 'active',
      currencies: [{ currency: 'USD', unit_amount: 29.99 }],
      interval_unit: 'months',
      interval_length: 1,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan-001')
    expect(result.externalId).toBe('plan-001')
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.active).toBe(true)
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('recurly')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly plan correctly', () => {
    const raw: RawRecurlyPlan = {
      id: 'plan-002',
      code: 'pro-annual',
      name: 'Pro Annual',
      state: 'active',
      currencies: [{ currency: 'EUR', unit_amount: 199 }],
      interval_unit: 'years',
      interval_length: 1,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(19900)
    expect(result.currency).toBe('EUR')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a plan with trial period in days correctly', () => {
    const raw: RawRecurlyPlan = {
      id: 'plan-003',
      code: 'trial-plan',
      name: 'Trial Plan',
      state: 'active',
      currencies: [{ currency: 'USD', unit_amount: 9.99 }],
      interval_unit: 'months',
      interval_length: 1,
      trial_unit: 'days',
      trial_length: 14,
    }
    const result = transformPlan(raw)
    expect(result.trialPeriodDays).toBe(14)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('marks a deleted plan as inactive', () => {
    const raw: RawRecurlyPlan = {
      id: 'plan-004',
      code: 'old-plan',
      name: 'Old Plan',
      state: 'active',
      currencies: [{ currency: 'USD', unit_amount: 5 }],
      interval_unit: 'months',
      interval_length: 1,
      deleted_at: '2024-02-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
