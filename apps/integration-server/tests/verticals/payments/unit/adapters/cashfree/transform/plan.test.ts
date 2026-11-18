import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawCashfreePlan,
} from '../../../../../../../src/verticals/payments/adapters/cashfree/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('cashfree transformPlan', () => {
  it('maps an active monthly plan', () => {
    const raw: RawCashfreePlan = {
      plan_id: 'plan-001',
      plan_name: 'Monthly Basic',
      plan_status: 'ACTIVE',
      plan_recurring_amount: 99,
      plan_currency: 'INR',
      plan_interval_type: 'MONTH',
      plan_intervals: 1,
      plan_max_cycles: 12,
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan-001')
    expect(result.nickname).toBe('Monthly Basic')
    expect(result.active).toBe(true)
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('INR')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('cashfree')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps an inactive yearly plan', () => {
    const raw: RawCashfreePlan = {
      plan_id: 'plan-002',
      plan_status: 'INACTIVE',
      plan_recurring_amount: 999,
      plan_currency: 'INR',
      plan_interval_type: 'YEAR',
      plan_intervals: 1,
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(false)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(99900)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('defaults interval to month for unknown interval type', () => {
    const raw: RawCashfreePlan = {
      plan_id: 'plan-003',
      plan_recurring_amount: 50,
      plan_currency: 'USD',
      plan_interval_type: 'BIWEEKLY',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('month')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
