import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawStripePlan,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('stitch transformPlan', () => {
  it('maps id, amount, currency, interval, and gateway fields', () => {
    const raw: RawStripePlan = {
      id: 'plan_stitch_001',
      object: 'plan',
      amount: 2999,
      currency: 'usd',
      interval: 'month',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan_stitch_001')
    expect(result.externalId).toBe('plan_stitch_001')
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.gateway).toBe('stripe')
  })

  it('upper-cases currency', () => {
    const raw: RawStripePlan = {
      id: 'plan_stitch_002',
      object: 'plan',
      amount: 999,
      currency: 'eur',
      interval: 'year',
    }
    const result = transformPlan(raw)
    expect(result.currency).toBe('EUR')
  })

  it('maps productId from product field', () => {
    const raw: RawStripePlan = {
      id: 'plan_stitch_003',
      object: 'plan',
      amount: 500,
      currency: 'usd',
      interval: 'month',
      product: 'prod_001',
    }
    const result = transformPlan(raw)
    expect(result.productId).toBe('prod_001')
  })

  it('maps nickname, active, intervalCount, and trialPeriodDays', () => {
    const raw: RawStripePlan = {
      id: 'plan_stitch_004',
      object: 'plan',
      amount: 1999,
      currency: 'usd',
      interval: 'month',
      nickname: 'Pro Monthly',
      active: true,
      interval_count: 3,
      trial_period_days: 14,
    }
    const result = transformPlan(raw)
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.active).toBe(true)
    expect(result.intervalCount).toBe(3)
    expect(result.trialPeriodDays).toBe(14)
  })

  it('defaults amount to 0 when missing', () => {
    const raw: RawStripePlan = {
      id: 'plan_stitch_005',
      object: 'plan',
      currency: 'usd',
      interval: 'week',
    }
    const result = transformPlan(raw)
    expect(result.amount).toBe(0)
  })

  it('converts unix created to ISO string', () => {
    const raw: RawStripePlan = {
      id: 'plan_stitch_006',
      object: 'plan',
      amount: 500,
      currency: 'usd',
      interval: 'month',
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes PlanSchema validation', () => {
    const raw: RawStripePlan = {
      id: 'plan_stitch_007',
      object: 'plan',
      product: 'prod_001',
      nickname: 'Annual',
      active: true,
      amount: 9999,
      currency: 'gbp',
      interval: 'year',
      interval_count: 1,
      trial_period_days: 0,
      created: 1709251200,
      metadata: { tier: 'premium' },
    }
    const result = transformPlan(raw)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
