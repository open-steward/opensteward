import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawPaddlePrice,
} from '../../../../../../../src/verticals/payments/adapters/paddle/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('paddle transformPlan', () => {
  it('maps an active Paddle Price to canonical Plan with all fields', () => {
    const raw: RawPaddlePrice = {
      id: 'pri_paddle_001',
      product_id: 'pro_001',
      name: 'Pro Monthly',
      status: 'active',
      unit_price: { amount: '1999', currency_code: 'usd' },
      currency_code: 'usd',
      billing_cycle: { interval: 'month', frequency: 1 },
      trial_period: { interval: 'day', frequency: 14 },
      custom_data: { feature_tier: 'pro' },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    }
    const result = transformPlan(raw)

    expect(result.id).toBe('pri_paddle_001')
    expect(result.externalId).toBe('pri_paddle_001')
    expect(result.productId).toBe('pro_001')
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.active).toBe(true)
    expect(result.amount).toBe(1999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.trialPeriodDays).toBe(14)
    expect(result.gateway).toBe('paddle')
    expect(result.metadata.feature_tier).toBe('pro')
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps an inactive Price to active=false', () => {
    const raw: RawPaddlePrice = {
      id: 'pri_paddle_002',
      status: 'archived',
      unit_price: { amount: '999', currency_code: 'EUR' },
      billing_cycle: { interval: 'year', frequency: 1 },
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(false)
    expect(result.interval).toBe('year')
    expect(result.currency).toBe('EUR')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('converts weekly trial period to days correctly', () => {
    const raw: RawPaddlePrice = {
      id: 'pri_paddle_003',
      status: 'active',
      unit_price: { amount: '500', currency_code: 'USD' },
      billing_cycle: { interval: 'month', frequency: 1 },
      trial_period: { interval: 'week', frequency: 2 },
    }
    const result = transformPlan(raw)
    expect(result.trialPeriodDays).toBe(14)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('converts monthly trial period to days', () => {
    const raw: RawPaddlePrice = {
      id: 'pri_paddle_004',
      status: 'active',
      unit_price: { amount: '2000', currency_code: 'USD' },
      billing_cycle: { interval: 'year', frequency: 1 },
      trial_period: { interval: 'month', frequency: 1 },
    }
    const result = transformPlan(raw)
    expect(result.trialPeriodDays).toBe(30)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('falls back to currency_code when unit_price.currency_code is absent', () => {
    const raw: RawPaddlePrice = {
      id: 'pri_paddle_005',
      status: 'active',
      currency_code: 'GBP',
      unit_price: { amount: '1500' },
      billing_cycle: { interval: 'month', frequency: 3 },
    }
    const result = transformPlan(raw)
    expect(result.currency).toBe('GBP')
    expect(result.intervalCount).toBe(3)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('defaults intervalCount to 1 when billing_cycle.frequency is absent', () => {
    const raw: RawPaddlePrice = {
      id: 'pri_paddle_006',
      status: 'active',
      unit_price: { amount: '1000', currency_code: 'USD' },
      billing_cycle: { interval: 'month' },
    }
    const result = transformPlan(raw)
    expect(result.intervalCount).toBe(1)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
