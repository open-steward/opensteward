import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawStripePlan,
} from '../../../../../../../src/verticals/payments/adapters/zuora/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('zuora transformPlan', () => {
  it('maps id, amount, currency and interval correctly', () => {
    const raw: RawStripePlan = {
      id: 'zuora-plan-001',
      object: 'plan',
      amount: 2999,
      currency: 'usd',
      interval: 'month',
      interval_count: 1,
      active: true,
      product: 'zuora-prod-001',
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('zuora-plan-001')
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.gateway).toBe('stripe')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps productId, nickname and year interval', () => {
    const raw: RawStripePlan = {
      id: 'zuora-plan-002',
      object: 'plan',
      amount: 29900,
      currency: 'eur',
      interval: 'year',
      product: 'zuora-prod-002',
      nickname: 'Zuora Annual',
      active: true,
    }
    const result = transformPlan(raw)
    expect(result.productId).toBe('zuora-prod-002')
    expect(result.nickname).toBe('Zuora Annual')
    expect(result.interval).toBe('year')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
