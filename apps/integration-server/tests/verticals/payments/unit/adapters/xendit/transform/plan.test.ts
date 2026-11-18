import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawXenditRecurringPlan,
} from '../../../../../../../src/verticals/payments/adapters/xendit/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('xendit transformPlan', () => {
  it('maps an ACTIVE monthly plan with correct interval and amount', () => {
    const raw: RawXenditRecurringPlan = {
      id: 'plan-001',
      reference_id: 'ref-001',
      customer_id: 'cust-1',
      currency: 'IDR',
      amount: 150000,
      status: 'ACTIVE',
      description: 'Monthly Premium',
      schedule: {
        interval: 'MONTH',
        interval_count: 1,
        anchor_date: '2024-03-01T00:00:00Z',
      },
      created: '2024-03-01T00:00:00Z',
      updated: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(true)
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.amount).toBe(150000)
    expect(result.currency).toBe('IDR')
    expect(result.nickname).toBe('Monthly Premium')
    expect(result.gateway).toBe('xendit')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps an INACTIVE plan with active=false', () => {
    const raw: RawXenditRecurringPlan = {
      id: 'plan-002',
      currency: 'PHP',
      amount: 99900,
      status: 'INACTIVE',
      schedule: {
        interval: 'YEAR',
        interval_count: 1,
      },
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(false)
    expect(result.interval).toBe('year')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps DAY and WEEK intervals correctly', () => {
    const rawDay: RawXenditRecurringPlan = {
      id: 'plan-003',
      currency: 'IDR',
      amount: 5000,
      status: 'ACTIVE',
      schedule: { interval: 'DAY' },
      created: '2024-03-01T00:00:00Z',
    }
    expect(transformPlan(rawDay).interval).toBe('day')

    const rawWeek: RawXenditRecurringPlan = {
      id: 'plan-004',
      currency: 'IDR',
      amount: 10000,
      status: 'ACTIVE',
      schedule: { interval: 'WEEK' },
      created: '2024-03-01T00:00:00Z',
    }
    expect(transformPlan(rawWeek).interval).toBe('week')
    expect(() => PlanSchema.parse(transformPlan(rawWeek))).not.toThrow()
  })
})
