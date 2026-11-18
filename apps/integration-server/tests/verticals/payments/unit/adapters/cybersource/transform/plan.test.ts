import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawCybersourcePlan,
} from '../../../../../../../src/verticals/payments/adapters/cybersource/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('cybersource transformPlan', () => {
  it('maps a monthly active plan', () => {
    const raw: RawCybersourcePlan = {
      id: 'plan_1',
      planInformation: {
        code: 'MONTHLY_PRO',
        name: 'Pro Monthly',
        description: 'Monthly Pro subscription',
        status: 'ACTIVE',
        billingPeriod: { unit: 'm', length: '1' },
        billingCycles: { total: '12' },
      },
      orderInformation: {
        amountDetails: {
          billingAmount: '29.99',
          currency: 'USD',
        },
      },
      submitTimeUtc: '2023-11-14T10:00:00Z',
    }
    const result = transformPlan(raw)

    expect(result.id).toBe('plan_1')
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.active).toBe(true)
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('cybersource')
    expect(result.metadata.planCode).toBe('MONTHLY_PRO')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly plan with year billing unit', () => {
    const raw: RawCybersourcePlan = {
      id: 'plan_2',
      planInformation: {
        name: 'Annual Plan',
        status: 'ACTIVE',
        billingPeriod: { unit: 'y', length: '1' },
      },
      orderInformation: {
        amountDetails: { billingAmount: '199.99', currency: 'EUR' },
      },
    }
    const result = transformPlan(raw)

    expect(result.interval).toBe('year')
    expect(result.currency).toBe('EUR')
    expect(result.amount).toBe(19999)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a weekly day plan', () => {
    const raw: RawCybersourcePlan = {
      id: 'plan_3',
      planInformation: {
        status: 'ACTIVE',
        billingPeriod: { unit: 'w', length: '2' },
      },
      orderInformation: {
        amountDetails: { billingAmount: '5.00', currency: 'GBP' },
      },
    }
    const result = transformPlan(raw)

    expect(result.interval).toBe('week')
    expect(result.intervalCount).toBe(2)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('inactive plan when status is not ACTIVE', () => {
    const raw: RawCybersourcePlan = {
      id: 'plan_4',
      planInformation: {
        status: 'INACTIVE',
      },
      orderInformation: {
        amountDetails: { billingAmount: '10.00', currency: 'USD' },
      },
    }
    const result = transformPlan(raw)

    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
