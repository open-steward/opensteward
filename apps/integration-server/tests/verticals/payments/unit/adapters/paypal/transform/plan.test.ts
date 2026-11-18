import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawPayPalPlan,
} from '../../../../../../../src/verticals/payments/adapters/paypal/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('paypal transformPlan', () => {
  it('maps an ACTIVE monthly plan', () => {
    const raw: RawPayPalPlan = {
      id: 'PLAN-001',
      product_id: 'PROD-001',
      name: 'Pro Monthly',
      status: 'ACTIVE',
      billing_cycles: [
        {
          pricing_scheme: { fixed_price: { value: '9.99', currency_code: 'USD' } },
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
        },
      ],
      create_time: '2024-01-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('PLAN-001')
    expect(result.active).toBe(true)
    expect(result.amount).toBe(999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.gateway).toBe('paypal')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a YEAR interval correctly', () => {
    const raw: RawPayPalPlan = {
      id: 'PLAN-002',
      status: 'ACTIVE',
      billing_cycles: [
        {
          pricing_scheme: { fixed_price: { value: '99.00', currency_code: 'EUR' } },
          frequency: { interval_unit: 'YEAR', interval_count: 1 },
        },
      ],
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(9900)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps an INACTIVE plan to active=false', () => {
    const raw: RawPayPalPlan = {
      id: 'PLAN-003',
      status: 'INACTIVE',
      billing_cycles: [],
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
