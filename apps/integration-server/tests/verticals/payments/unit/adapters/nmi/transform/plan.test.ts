import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawNmiPlan,
} from '../../../../../../../src/verticals/payments/adapters/nmi/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('nmi transformPlan', () => {
  it('maps a monthly plan with monthFrequency=1', () => {
    const raw: RawNmiPlan = {
      planId: 'plan-001',
      planName: 'Monthly Basic',
      planAmount: '29.99',
      monthFrequency: '1',
      dayOfMonth: '1',
      planPayments: '12',
      currency: 'USD',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan-001')
    expect(result.externalId).toBe('plan-001')
    expect(result.nickname).toBe('Monthly Basic')
    expect(result.active).toBe(true)
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('nmi')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a weekly plan with dayFrequency=7', () => {
    const raw: RawNmiPlan = {
      planId: 'plan-002',
      planAmount: '9.99',
      dayFrequency: '7',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(result.intervalCount).toBe(7)
    expect(result.currency).toBe('USD')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps an annual plan with monthFrequency=12', () => {
    const raw: RawNmiPlan = {
      planId: 'plan-003',
      planAmount: '299.00',
      monthFrequency: '12',
      currency: 'USD',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.intervalCount).toBe(12)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a daily plan with dayFrequency=1', () => {
    const raw: RawNmiPlan = {
      planId: 'plan-004',
      planAmount: '1.00',
      dayFrequency: '1',
      currency: 'USD',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('day')
    expect(result.amount).toBe(100)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('defaults interval to month and currency to USD when neither frequency field is set', () => {
    const raw: RawNmiPlan = {
      planId: 'plan-005',
      planAmount: '50.00',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('month')
    expect(result.currency).toBe('USD')
    expect(result.trialPeriodDays).toBeUndefined()
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
