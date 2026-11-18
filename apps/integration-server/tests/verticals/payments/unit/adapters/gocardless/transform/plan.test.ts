import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawGCSubscriptionAsPlan,
} from '../../../../../../../src/verticals/payments/adapters/gocardless/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('gocardless transformPlan', () => {
  it('maps a monthly subscription to a canonical Plan', () => {
    const raw: RawGCSubscriptionAsPlan = {
      id: 'SB001',
      name: 'Basic Monthly',
      amount: 1000,
      currency: 'gbp',
      interval: 1,
      interval_unit: 'monthly',
      created_at: '2024-01-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('SB001')
    expect(result.nickname).toBe('Basic Monthly')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('GBP')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('gocardless')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a weekly interval_unit to "week"', () => {
    const raw: RawGCSubscriptionAsPlan = {
      id: 'SB002',
      amount: 250,
      currency: 'gbp',
      interval: 2,
      interval_unit: 'weekly',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(result.intervalCount).toBe(2)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly interval_unit to "year"', () => {
    const raw: RawGCSubscriptionAsPlan = {
      id: 'SB003',
      amount: 12000,
      currency: 'eur',
      interval: 1,
      interval_unit: 'yearly',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.currency).toBe('EUR')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a daily interval_unit to "day"', () => {
    const raw: RawGCSubscriptionAsPlan = {
      id: 'SB004',
      amount: 100,
      currency: 'gbp',
      interval: 7,
      interval_unit: 'daily',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('day')
    expect(result.intervalCount).toBe(7)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('defaults unknown interval_unit to "month"', () => {
    const raw: RawGCSubscriptionAsPlan = {
      id: 'SB005',
      amount: 500,
      currency: 'gbp',
      interval_unit: 'fortnightly',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('month')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
