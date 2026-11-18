import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawStripePlan,
} from '../../../../../../../src/verticals/payments/adapters/sumup/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('sumup transformPlan', () => {
  it('maps id, amount, currency, interval and gateway', () => {
    const raw: RawStripePlan = {
      id: 'plan_001',
      object: 'plan',
      amount: 999,
      currency: 'usd',
      interval: 'month',
      active: true,
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan_001')
    expect(result.externalId).toBe('plan_001')
    expect(result.amount).toBe(999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('stripe')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('upcases currency', () => {
    const raw: RawStripePlan = {
      id: 'plan_002',
      object: 'plan',
      currency: 'eur',
      interval: 'year',
    }
    expect(transformPlan(raw).currency).toBe('EUR')
  })

  it('maps productId from product field', () => {
    const raw: RawStripePlan = {
      id: 'plan_003',
      object: 'plan',
      currency: 'usd',
      interval: 'month',
      product: 'prod_abc',
    }
    expect(transformPlan(raw).productId).toBe('prod_abc')
  })

  it('maps nickname and trialPeriodDays', () => {
    const raw: RawStripePlan = {
      id: 'plan_004',
      object: 'plan',
      currency: 'usd',
      interval: 'week',
      nickname: 'Weekly plan',
      trial_period_days: 14,
    }
    const result = transformPlan(raw)
    expect(result.nickname).toBe('Weekly plan')
    expect(result.trialPeriodDays).toBe(14)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('defaults amount to 0 when missing', () => {
    const raw: RawStripePlan = {
      id: 'plan_005',
      object: 'plan',
      currency: 'usd',
      interval: 'day',
    }
    expect(transformPlan(raw).amount).toBe(0)
  })

  it('maps intervalCount and createdAt from unix timestamp', () => {
    const raw: RawStripePlan = {
      id: 'plan_006',
      object: 'plan',
      currency: 'usd',
      interval: 'month',
      interval_count: 3,
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.intervalCount).toBe(3)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
