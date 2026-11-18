import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawStripePlan,
} from '../../../../../../../src/verticals/payments/adapters/tyro/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('tyro transformPlan', () => {
  it('maps a monthly plan with product reference', () => {
    const raw: RawStripePlan = {
      id: 'plan_tyro_001',
      object: 'plan',
      product: 'prod_tyro_001',
      nickname: 'POS Monthly',
      active: true,
      amount: 4900,
      currency: 'aud',
      interval: 'month',
      interval_count: 1,
      created: 1709251200,
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan_tyro_001')
    expect(result.productId).toBe('prod_tyro_001')
    expect(result.interval).toBe('month')
    expect(result.amount).toBe(4900)
    expect(result.currency).toBe('AUD')
    expect(result.gateway).toBe('stripe')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a weekly plan', () => {
    const raw: RawStripePlan = {
      id: 'plan_tyro_002',
      object: 'plan',
      product: 'prod_tyro_002',
      active: false,
      amount: 1000,
      currency: 'aud',
      interval: 'week',
      created: 1709337600,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
