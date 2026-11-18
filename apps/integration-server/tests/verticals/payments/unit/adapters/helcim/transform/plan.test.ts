import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawHelcimPaymentPlan,
} from '../../../../../../../src/verticals/payments/adapters/helcim/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('helcim transformPlan', () => {
  it('maps an active monthly plan with decimal amount', () => {
    const raw: RawHelcimPaymentPlan = {
      id: 301,
      name: 'Basic Monthly',
      description: 'Monthly basic plan',
      recurringAmount: 29.99,
      currency: 'CAD',
      billingPeriod: 'monthly',
      billingPeriodIncrements: 1,
      status: 'active',
      dateCreated: '2024-03-01 00:00:00',
      dateUpdated: '2024-03-01 00:00:00',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('301')
    expect(result.nickname).toBe('Basic Monthly')
    expect(result.active).toBe(true)
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('CAD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('helcim')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly plan interval', () => {
    const raw: RawHelcimPaymentPlan = {
      id: 302,
      recurringAmount: 299.99,
      currency: 'USD',
      billingPeriod: 'yearly',
      status: 'active',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(29999)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a weekly plan interval', () => {
    const raw: RawHelcimPaymentPlan = {
      id: 303,
      recurringAmount: 9.99,
      currency: 'CAD',
      billingPeriod: 'weekly',
      status: 'active',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a daily plan interval', () => {
    const raw: RawHelcimPaymentPlan = {
      id: 304,
      recurringAmount: 1.0,
      currency: 'USD',
      billingPeriod: 'daily',
      status: 'active',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('day')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps an inactive plan to active=false', () => {
    const raw: RawHelcimPaymentPlan = {
      id: 305,
      recurringAmount: 19.99,
      currency: 'CAD',
      billingPeriod: 'monthly',
      status: 'inactive',
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(false)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps freeTrialPeriod to trialPeriodDays', () => {
    const raw: RawHelcimPaymentPlan = {
      id: 306,
      recurringAmount: 9.99,
      currency: 'USD',
      billingPeriod: 'monthly',
      freeTrialPeriod: 14,
      status: 'active',
    }
    const result = transformPlan(raw)
    expect(result.trialPeriodDays).toBe(14)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
