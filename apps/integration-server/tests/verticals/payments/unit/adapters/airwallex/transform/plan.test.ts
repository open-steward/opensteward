import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawAirwallexPrice,
} from '../../../../../../../src/verticals/payments/adapters/airwallex/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('airwallex transformPlan', () => {
  it('maps a monthly recurring price with unit_amount in major units to minor units', () => {
    const raw: RawAirwallexPrice = {
      id: 'price-001',
      product_id: 'prod-001',
      currency: 'usd',
      unit_amount: 9.99,
      active: true,
      nickname: 'Basic Monthly',
      recurring: { period_unit: 'MONTH', period: 1 },
      trial_period_days: 14,
      created_at: '2024-03-01T12:00:00+0000',
      updated_at: '2024-03-01T12:00:00+0000',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('price-001')
    expect(result.amount).toBe(999)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.active).toBe(true)
    expect(result.trialPeriodDays).toBe(14)
    expect(result.gateway).toBe('airwallex')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps period_unit "YEAR" to interval "year"', () => {
    const raw: RawAirwallexPrice = {
      id: 'price-002',
      currency: 'USD',
      unit_amount: 99.0,
      recurring: { period_unit: 'YEAR', period: 1 },
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(9900)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps period_unit "WEEK" to interval "week"', () => {
    const raw: RawAirwallexPrice = {
      id: 'price-003',
      currency: 'USD',
      unit_amount: 5.0,
      recurring: { period_unit: 'WEEK', period: 2 },
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(result.intervalCount).toBe(2)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps period_unit "DAY" to interval "day"', () => {
    const raw: RawAirwallexPrice = {
      id: 'price-004',
      currency: 'EUR',
      unit_amount: 1.0,
      recurring: { period_unit: 'DAY', period: 7 },
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('day')
    expect(result.intervalCount).toBe(7)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('falls back to flat_amount when unit_amount is absent', () => {
    const raw: RawAirwallexPrice = {
      id: 'price-005',
      currency: 'USD',
      flat_amount: 20.0,
      recurring: { period_unit: 'MONTH', period: 1 },
    }
    const result = transformPlan(raw)
    expect(result.amount).toBe(2000)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('defaults to interval "month" and intervalCount 1 when recurring is absent', () => {
    const raw: RawAirwallexPrice = {
      id: 'price-006',
      currency: 'AUD',
      unit_amount: 15.0,
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('uses description as nickname when nickname is absent', () => {
    const raw: RawAirwallexPrice = {
      id: 'price-007',
      currency: 'USD',
      unit_amount: 10.0,
      description: 'Standard Plan',
      recurring: { period_unit: 'MONTH' },
    }
    const result = transformPlan(raw)
    expect(result.nickname).toBe('Standard Plan')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
