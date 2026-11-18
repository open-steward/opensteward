import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawBluesnapPlan,
} from '../../../../../../../src/verticals/payments/adapters/bluesnap/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('bluesnap transformPlan', () => {
  it('maps an ACTIVE MONTHLY plan with correct amount and interval', () => {
    const raw: RawBluesnapPlan = {
      planId: 'PLAN-001',
      name: 'Basic Monthly',
      chargeFrequency: 'MONTHLY',
      recurringChargeAmount: 9.99,
      currency: 'USD',
      status: 'ACTIVE',
      trialPeriodDays: 0,
      gracePeriodDays: 3,
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('PLAN-001')
    expect(result.nickname).toBe('Basic Monthly')
    expect(result.active).toBe(true)
    // 9.99 → 999 cents
    expect(result.amount).toBe(999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.gateway).toBe('bluesnap')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a WEEKLY plan to interval "week"', () => {
    const raw: RawBluesnapPlan = {
      planId: 'PLAN-002',
      name: 'Weekly Plan',
      chargeFrequency: 'WEEKLY',
      recurringChargeAmount: 2.5,
      currency: 'GBP',
      status: 'ACTIVE',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(result.amount).toBe(250)
    expect(result.currency).toBe('GBP')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps an ANNUALLY plan to interval "year"', () => {
    const raw: RawBluesnapPlan = {
      planId: 'PLAN-003',
      name: 'Annual Plan',
      chargeFrequency: 'ANNUALLY',
      recurringChargeAmount: 99.0,
      currency: 'USD',
      status: 'ACTIVE',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(9900)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('marks an inactive plan (non-ACTIVE status)', () => {
    const raw: RawBluesnapPlan = {
      planId: 'PLAN-004',
      name: 'Archived Plan',
      chargeFrequency: 'MONTHLY',
      recurringChargeAmount: 5.0,
      currency: 'USD',
      status: 'INACTIVE',
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('treats null status as active', () => {
    const raw: RawBluesnapPlan = {
      planId: 'PLAN-005',
      recurringChargeAmount: 20.0,
      currency: 'EUR',
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(true)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
