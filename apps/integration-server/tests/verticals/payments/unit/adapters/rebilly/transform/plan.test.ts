import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawRebillyPlan,
} from '../../../../../../../src/verticals/payments/adapters/rebilly/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

// SubscriptionPlan.yaml + PlanFormulaFixedFee.yaml ("price": 99.95) + PlanTrial.yaml.
const base: RawRebillyPlan = {
  id: 'plan_0YV7DENSVGDBW9S71XZNNYYQ0X',
  type: 'subscription',
  name: 'Gold',
  productId: 'prod_0YV7DES3WPC5J8JD8QTVNZBZNZ',
  currency: 'USD',
  isActive: true,
  pricing: { formula: 'fixed-fee', price: 99.95 },
  recurringInterval: { unit: 'month', length: 3 },
  trial: { price: 0, period: { unit: 'week', length: 2 } },
  createdTime: '2026-01-15T00:00:00Z',
}

describe('rebilly transformPlan', () => {
  it('maps the documented fields', () => {
    expect(PlanSchema.parse(transformPlan(base))).toMatchObject({
      nickname: 'Gold',
      productId: 'prod_0YV7DES3WPC5J8JD8QTVNZBZNZ',
      active: true,
      amount: 9995,
      currency: 'USD',
      interval: 'month',
      intervalCount: 3,
      trialPeriodDays: 14,
    })
  })

  it('omits trial days for month/year trials', () => {
    expect(
      transformPlan({ ...base, trial: { price: 0, period: { unit: 'month', length: 1 } } })
        .trialPeriodDays,
    ).toBeUndefined()
  })

  it('throws for a plan with no recurring interval or no single price', () => {
    expect(() => transformPlan({ ...base, recurringInterval: undefined })).toThrow(
      /recurringInterval/,
    )
    expect(() => transformPlan({ ...base, pricing: { formula: 'tiered' } })).toThrow(/single price/)
    expect(() => transformPlan({ ...base, currency: undefined })).toThrow(/single price/)
  })

  it('reads active from isActive and leaves it unset when absent', () => {
    expect(transformPlan({ ...base, isActive: false }).active).toBe(false)
    expect(transformPlan({ ...base, isActive: undefined }).active).toBeUndefined()
  })
})
