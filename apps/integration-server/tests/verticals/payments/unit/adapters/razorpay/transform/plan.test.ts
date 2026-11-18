import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawRazorpayPlan,
} from '../../../../../../../src/verticals/payments/adapters/razorpay/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('razorpay transformPlan', () => {
  it('maps a monthly plan with item details to canonical Plan', () => {
    const raw: RawRazorpayPlan = {
      id: 'plan_1',
      period: 'monthly',
      interval: 1,
      item: {
        id: 'item_abc',
        name: 'Pro Monthly',
        amount: 4900,
        currency: 'INR',
        description: 'Pro plan billed monthly',
      },
      notes: { internal: 'team-a' },
      created_at: 1_700_000_000,
    }
    const result = transformPlan(raw)

    expect(result.id).toBe('plan_1')
    expect(result.productId).toBe('item_abc')
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.amount).toBe(4900)
    expect(result.currency).toBe('INR')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('razorpay')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps yearly period to year interval', () => {
    const raw: RawRazorpayPlan = {
      id: 'plan_2',
      period: 'yearly',
      interval: 1,
      item: { amount: 49000, currency: 'INR' },
      created_at: 1_700_000_000,
    }
    const result = transformPlan(raw)

    expect(result.interval).toBe('year')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps weekly period to week interval', () => {
    const raw: RawRazorpayPlan = {
      id: 'plan_3',
      period: 'weekly',
      interval: 2,
      item: { amount: 199, currency: 'INR' },
      created_at: 1_700_000_000,
    }
    const result = transformPlan(raw)

    expect(result.interval).toBe('week')
    expect(result.intervalCount).toBe(2)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
