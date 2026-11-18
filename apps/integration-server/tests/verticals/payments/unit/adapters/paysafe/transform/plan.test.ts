import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawPaysafePlan,
} from '../../../../../../../src/verticals/payments/adapters/paysafe/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('paysafe transformPlan', () => {
  it('maps an active monthly plan', () => {
    const raw: RawPaysafePlan = {
      id: 'plan_001',
      name: 'Pro Monthly',
      description: 'Monthly pro subscription',
      amount: 9900,
      currencyCode: 'USD',
      status: 'ACTIVE',
      billingCycle: { frequency: 'MONTHLY', interval: 1, numberOfCycles: 12 },
      creationTime: '2024-03-01T00:00:00Z',
    }

    const result = transformPlan(raw)

    expect(result.id).toBe('plan_001')
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('paysafe')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a DAILY interval plan', () => {
    const raw: RawPaysafePlan = {
      id: 'plan_002',
      name: 'Daily Plan',
      amount: 100,
      currencyCode: 'USD',
      status: 'ACTIVE',
      billingCycle: { frequency: 'DAILY', interval: 1 },
      creationTime: '2024-03-01T00:00:00Z',
    }

    const result = transformPlan(raw)

    expect(result.interval).toBe('day')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a WEEKLY interval plan', () => {
    const raw: RawPaysafePlan = {
      id: 'plan_003',
      amount: 500,
      currencyCode: 'GBP',
      status: 'ACTIVE',
      billingCycle: { frequency: 'WEEKLY', interval: 2 },
      creationTime: '2024-03-01T00:00:00Z',
    }

    const result = transformPlan(raw)

    expect(result.interval).toBe('week')
    expect(result.intervalCount).toBe(2)
    expect(result.currency).toBe('GBP')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a YEARLY interval plan and inactive status', () => {
    const raw: RawPaysafePlan = {
      id: 'plan_004',
      amount: 99900,
      currencyCode: 'EUR',
      status: 'INACTIVE',
      billingCycle: { frequency: 'YEARLY', interval: 1 },
      creationTime: '2024-03-01T00:00:00Z',
    }

    const result = transformPlan(raw)

    expect(result.interval).toBe('year')
    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
