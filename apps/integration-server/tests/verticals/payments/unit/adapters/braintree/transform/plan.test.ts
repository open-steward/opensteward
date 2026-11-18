import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawBraintreePlan,
} from '../../../../../../../src/verticals/payments/adapters/braintree/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('braintree transformPlan', () => {
  it('maps a monthly billing plan to canonical', () => {
    const raw: RawBraintreePlan = {
      id: 'plan_001',
      name: 'Pro Monthly',
      description: 'Pro tier billed monthly',
      price: { value: '29.99', currencyIsoCode: 'USD' },
      billingFrequency: 1,
      billingFrequencyUnit: 'MONTH',
      numberOfBillingCycles: 12,
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan_001')
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.gateway).toBe('braintree')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps an annual billing plan with trial period', () => {
    const raw: RawBraintreePlan = {
      id: 'plan_002',
      name: 'Pro Annual',
      price: { value: '299.99', currencyIsoCode: 'EUR' },
      billingFrequency: 1,
      billingFrequencyUnit: 'YEAR',
      trialDuration: 14,
      trialDurationUnit: 'DAY',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.currency).toBe('EUR')
    expect(result.amount).toBe(29999)
    expect(result.trialPeriodDays).toBe(14)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a weekly billing plan', () => {
    const raw: RawBraintreePlan = {
      id: 'plan_003',
      name: 'Weekly',
      price: { value: '5.00', currencyIsoCode: 'GBP' },
      billingFrequencyUnit: 'WEEK',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(result.amount).toBe(500)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('defaults interval to month for unknown billing frequency unit', () => {
    const raw: RawBraintreePlan = {
      id: 'plan_004',
      name: 'Custom',
      price: { value: '10.00', currencyIsoCode: 'USD' },
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('month')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
