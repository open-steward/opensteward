import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawPaystackPlan,
} from '../../../../../../../src/verticals/payments/adapters/paystack/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('paystack transformPlan', () => {
  it('maps a monthly plan with amount and active status', () => {
    const raw: RawPaystackPlan = {
      id: 401,
      plan_code: 'PLN_monthly001',
      name: 'Pro Monthly',
      amount: 99900,
      interval: 'monthly',
      currency: 'NGN',
      is_deleted: false,
      is_archived: false,
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('month')
    expect(result.amount).toBe(99900)
    expect(result.currency).toBe('NGN')
    expect(result.active).toBe(true)
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.gateway).toBe('paystack')
    expect(result.id).toBe('401')
    expect(result.externalId).toBe('PLN_monthly001')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a daily plan interval to "day"', () => {
    const raw: RawPaystackPlan = {
      id: 402,
      plan_code: 'PLN_daily001',
      name: 'Daily Plan',
      amount: 5000,
      interval: 'daily',
      currency: 'NGN',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('day')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps an annually plan interval to "year"', () => {
    const raw: RawPaystackPlan = {
      id: 403,
      plan_code: 'PLN_annual001',
      name: 'Annual Plan',
      amount: 999900,
      interval: 'annually',
      currency: 'NGN',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('marks plan inactive when is_deleted is true', () => {
    const raw: RawPaystackPlan = {
      id: 404,
      plan_code: 'PLN_deleted',
      name: 'Old Plan',
      amount: 10000,
      interval: 'monthly',
      currency: 'NGN',
      is_deleted: true,
      is_archived: false,
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
