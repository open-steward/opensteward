import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawSquareCatalogObject,
} from '../../../../../../../src/verticals/payments/adapters/square/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('square transformPlan', () => {
  it('maps a SUBSCRIPTION_PLAN catalog object with MONTHLY cadence', () => {
    const raw: RawSquareCatalogObject = {
      id: 'CAT-001',
      type: 'SUBSCRIPTION_PLAN',
      is_deleted: false,
      subscription_plan_data: {
        name: 'Basic Monthly',
        phases: [
          {
            cadence: 'MONTHLY',
            periods: 0,
            recurring_price_money: { amount: 1999, currency: 'USD' },
          },
        ],
      },
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('CAT-001')
    expect(result.nickname).toBe('Basic Monthly')
    expect(result.active).toBe(true)
    expect(result.amount).toBe(1999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.gateway).toBe('square')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps an ANNUAL cadence to interval "year"', () => {
    const raw: RawSquareCatalogObject = {
      id: 'CAT-002',
      type: 'SUBSCRIPTION_PLAN',
      is_deleted: false,
      subscription_plan_data: {
        name: 'Annual Plan',
        phases: [
          {
            cadence: 'ANNUAL',
            recurring_price_money: { amount: 19999, currency: 'USD' },
          },
        ],
      },
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(19999)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('marks a deleted plan as not active', () => {
    const raw: RawSquareCatalogObject = {
      id: 'CAT-003',
      is_deleted: true,
      subscription_plan_data: {
        name: 'Old Plan',
        phases: [],
      },
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
