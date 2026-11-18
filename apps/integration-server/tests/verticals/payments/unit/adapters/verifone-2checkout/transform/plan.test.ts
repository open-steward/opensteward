import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawVerifone2checkoutPricingConfig,
} from '../../../../../../../src/verticals/payments/adapters/verifone-2checkout/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('verifone-2checkout transformPlan', () => {
  it('maps full monthly pricing config correctly', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'MONTHLY_BASIC',
      Name: 'Basic Monthly',
      BillingCycle: 'MONTHLY',
      BillingCycleNumber: 1,
      TrialDays: 14,
      Prices: [{ Currency: 'USD', Amount: '9.99' }],
      ProductCode: 'PROD-001',
      CreatedAt: '2024-01-01T00:00:00Z',
      UpdatedAt: '2024-06-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('PROD-001:MONTHLY_BASIC')
    expect(result.externalId).toBe('PROD-001:MONTHLY_BASIC')
    expect(result.interval).toBe('month')
    expect(result.amount).toBe(999)
    expect(result.currency).toBe('USD')
    expect(result.nickname).toBe('Basic Monthly')
    expect(result.trialPeriodDays).toBe(14)
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('verifone-2checkout')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps YEARLY BillingCycle to "year"', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'YEARLY_PRO',
      BillingCycle: 'YEARLY',
      Prices: [{ Currency: 'USD', Amount: '99.99' }],
      ProductCode: 'PROD-002',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(9999)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps YEAR BillingCycle to "year"', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'YEAR_ENT',
      BillingCycle: 'YEAR',
      Prices: [{ Currency: 'EUR', Amount: '120.00' }],
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(12000)
    expect(result.currency).toBe('EUR')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps ANNUAL BillingCycle to "year"', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'ANNUAL_PLAN',
      BillingCycle: 'ANNUAL',
      Prices: [{ Currency: 'USD', Amount: '199.00' }],
      ProductCode: 'PROD-003',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps WEEKLY BillingCycle to "week"', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'WEEKLY_PLAN',
      BillingCycle: 'WEEKLY',
      Prices: [{ Currency: 'USD', Amount: '2.50' }],
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(result.amount).toBe(250)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps WEEK BillingCycle to "week"', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'WEEK_PLAN',
      BillingCycle: 'WEEK',
      Prices: [{ Currency: 'USD', Amount: '3.00' }],
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps DAILY BillingCycle to "day"', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'DAILY_PLAN',
      BillingCycle: 'DAILY',
      Prices: [{ Currency: 'USD', Amount: '0.99' }],
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('day')
    expect(result.amount).toBe(99)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps DAY BillingCycle to "day"', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'DAY_PLAN',
      BillingCycle: 'DAY',
      Prices: [{ Currency: 'USD', Amount: '1.50' }],
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('day')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps MONTH BillingCycle to "month"', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'MONTH_PLAN',
      BillingCycle: 'MONTH',
      Prices: [{ Currency: 'USD', Amount: '19.99' }],
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('month')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('defaults unknown BillingCycle to "month"', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'CUSTOM_PLAN',
      BillingCycle: 'QUARTERLY',
      Prices: [{ Currency: 'USD', Amount: '29.99' }],
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('month')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('builds id from Code only when ProductCode is absent', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'STANDALONE_PLAN',
      BillingCycle: 'MONTHLY',
      Prices: [{ Currency: 'USD', Amount: '14.99' }],
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('STANDALONE_PLAN')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('uses BasePrice when Prices array is absent', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'BASE_PLAN',
      BillingCycle: 'MONTHLY',
      BasePrice: '25.00',
      Currency: 'GBP',
    }
    const result = transformPlan(raw)
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('GBP')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('handles zero-decimal JPY currency', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'JPY_PLAN',
      BillingCycle: 'MONTHLY',
      Prices: [{ Currency: 'JPY', Amount: '1000' }],
    }
    const result = transformPlan(raw)
    expect(result.currency).toBe('JPY')
    expect(result.amount).toBe(1000)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('sets amount to 0 when no price information is provided', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'FREE_PLAN',
      BillingCycle: 'MONTHLY',
      Currency: 'USD',
    }
    const result = transformPlan(raw)
    expect(result.amount).toBe(0)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('defaults to USD when no currency is specified', () => {
    const raw: RawVerifone2checkoutPricingConfig = {
      Code: 'NO_CURR_PLAN',
      BillingCycle: 'MONTHLY',
      Prices: [{ Amount: '10.00' }],
    }
    const result = transformPlan(raw)
    expect(result.currency).toBe('USD')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
