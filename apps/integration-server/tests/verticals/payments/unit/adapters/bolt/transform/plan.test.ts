import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawBoltPlan,
} from '../../../../../../../src/verticals/payments/adapters/bolt/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('bolt transformPlan', () => {
  it('maps a monthly plan with amount', () => {
    const raw: RawBoltPlan = {
      id: 'plan-001',
      name: 'Monthly Pro',
      product_id: 'prod-abc',
      frequency_unit: 'month',
      frequency: 1,
      unit_price: 999,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan-001')
    expect(result.amount).toBe(999)
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.productId).toBe('prod-abc')
    expect(result.gateway).toBe('bolt')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly plan', () => {
    const raw: RawBoltPlan = {
      id: 'plan-002',
      frequency_unit: 'year',
      frequency: 1,
      unit_price: 9999,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(9999)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('defaults interval to month for unknown frequency_unit', () => {
    const raw: RawBoltPlan = {
      id: 'plan-003',
      frequency_unit: 'biweekly',
      unit_price: 500,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('month')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('active is always true', () => {
    const raw: RawBoltPlan = {
      id: 'plan-004',
      unit_price: 100,
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(true)
  })
})
