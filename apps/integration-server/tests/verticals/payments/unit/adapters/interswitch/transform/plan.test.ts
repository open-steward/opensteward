import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawStripePlan,
} from '../../../../../../../src/verticals/payments/adapters/interswitch/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('interswitch transformPlan', () => {
  it('maps a monthly plan correctly', () => {
    const raw: RawStripePlan = {
      id: 'plan-001',
      object: 'plan',
      product: 'prod-001',
      nickname: 'Pro Monthly',
      active: true,
      amount: 2999,
      currency: 'usd',
      interval: 'month',
      interval_count: 1,
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan-001')
    expect(result.productId).toBe('prod-001')
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.gateway).toBe('stripe')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly plan', () => {
    const raw: RawStripePlan = {
      id: 'plan-002',
      object: 'plan',
      active: true,
      amount: 29900,
      currency: 'usd',
      interval: 'year',
      interval_count: 1,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(29900)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
