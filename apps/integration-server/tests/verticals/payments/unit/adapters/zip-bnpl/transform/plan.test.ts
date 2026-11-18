import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawStripePlan,
} from '../../../../../../../src/verticals/payments/adapters/zip-bnpl/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('zip-bnpl transformPlan', () => {
  it('maps id, amount, currency and interval correctly', () => {
    const raw: RawStripePlan = {
      id: 'zip-plan-001',
      object: 'plan',
      amount: 1999,
      currency: 'usd',
      interval: 'month',
      interval_count: 1,
      active: true,
      product: 'prod-001',
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('zip-plan-001')
    expect(result.amount).toBe(1999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.gateway).toBe('stripe')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps productId and nickname', () => {
    const raw: RawStripePlan = {
      id: 'zip-plan-002',
      object: 'plan',
      amount: 4900,
      currency: 'eur',
      interval: 'year',
      product: 'prod-002',
      nickname: 'Annual Pro',
      active: false,
    }
    const result = transformPlan(raw)
    expect(result.productId).toBe('prod-002')
    expect(result.nickname).toBe('Annual Pro')
    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
