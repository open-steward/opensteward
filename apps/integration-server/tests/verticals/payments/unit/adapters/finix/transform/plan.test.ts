import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawFinixSubscriptionPlan,
} from '../../../../../../../src/verticals/payments/adapters/finix/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('finix transformPlan', () => {
  it('maps a MONTHLY ACTIVE plan to interval "month"', () => {
    const raw: RawFinixSubscriptionPlan = {
      id: 'SPi1',
      plan_name: 'Pro Monthly',
      billing_interval: 'MONTHLY',
      amount: 2999,
      currency: 'USD',
      state: 'ACTIVE',
      created_at: '2024-03-01T00:00:00.000Z',
      updated_at: '2024-03-01T00:00:00.000Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('SPi1')
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.interval).toBe('month')
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('USD')
    expect(result.active).toBe(true)
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('finix')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps DAILY interval to "day"', () => {
    const raw: RawFinixSubscriptionPlan = {
      id: 'SPi2',
      billing_interval: 'DAILY',
      amount: 100,
      currency: 'USD',
      state: 'ACTIVE',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('day')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps WEEKLY and BIWEEKLY intervals to "week"', () => {
    const raw1: RawFinixSubscriptionPlan = {
      id: 'SPi3',
      billing_interval: 'WEEKLY',
      amount: 500,
      currency: 'USD',
      state: 'ACTIVE',
    }
    const raw2: RawFinixSubscriptionPlan = {
      id: 'SPi4',
      billing_interval: 'BIWEEKLY',
      amount: 500,
      currency: 'USD',
      state: 'ACTIVE',
    }
    expect(transformPlan(raw1).interval).toBe('week')
    expect(transformPlan(raw2).interval).toBe('week')
  })

  it('maps YEARLY interval to "year"', () => {
    const raw: RawFinixSubscriptionPlan = {
      id: 'SPi5',
      billing_interval: 'YEARLY',
      amount: 29990,
      currency: 'USD',
      state: 'INACTIVE',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('computes trialPeriodDays from trial_defaults', () => {
    const raw: RawFinixSubscriptionPlan = {
      id: 'SPi6',
      billing_interval: 'MONTHLY',
      amount: 999,
      currency: 'USD',
      state: 'ACTIVE',
      trial_defaults: {
        interval_type: 'DAY',
        interval_count: 14,
      },
    }
    const result = transformPlan(raw)
    expect(result.trialPeriodDays).toBe(14)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('uses nickname fallback when plan_name is absent', () => {
    const raw: RawFinixSubscriptionPlan = {
      id: 'SPi7',
      nickname: 'Fallback Nickname',
      billing_interval: 'MONTHLY',
      amount: 500,
      currency: 'USD',
      state: 'ACTIVE',
    }
    const result = transformPlan(raw)
    expect(result.nickname).toBe('Fallback Nickname')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
