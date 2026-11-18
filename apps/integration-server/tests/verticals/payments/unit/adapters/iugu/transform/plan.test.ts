import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawIuguPlan,
} from '../../../../../../../src/verticals/payments/adapters/iugu/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('iugu transformPlan', () => {
  it('maps a monthly plan with BRL price', () => {
    const raw: RawIuguPlan = {
      identifier: 'basic_monthly',
      name: 'Basic Monthly',
      interval: 1,
      interval_type: 'months',
      prices: [{ currency: 'BRL', value_cents: 9900 }],
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('basic_monthly')
    expect(result.nickname).toBe('Basic Monthly')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('BRL')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('iugu')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('prefers BRL price over other currencies', () => {
    const raw: RawIuguPlan = {
      identifier: 'pro_plan',
      name: 'Pro',
      interval: 1,
      interval_type: 'months',
      prices: [
        { currency: 'USD', value_cents: 1000 },
        { currency: 'BRL', value_cents: 4900 },
      ],
    }
    const result = transformPlan(raw)
    expect(result.amount).toBe(4900)
    expect(result.currency).toBe('BRL')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a weekly interval', () => {
    const raw: RawIuguPlan = {
      identifier: 'weekly',
      interval: 1,
      interval_type: 'weeks',
      prices: [{ currency: 'BRL', value_cents: 2500 }],
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly interval', () => {
    const raw: RawIuguPlan = {
      identifier: 'yearly',
      interval: 1,
      interval_type: 'years',
      prices: [{ currency: 'BRL', value_cents: 99900 }],
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(99900)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('falls back to id when identifier is absent', () => {
    const raw: RawIuguPlan = {
      id: 'fallback-id',
      interval: 1,
      interval_type: 'months',
      prices: [{ currency: 'BRL', value_cents: 1000 }],
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('fallback-id')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('includes trial_period_days when provided', () => {
    const raw: RawIuguPlan = {
      identifier: 'trial_plan',
      interval: 1,
      interval_type: 'months',
      trial_period_days: 14,
      prices: [{ currency: 'BRL', value_cents: 7900 }],
    }
    const result = transformPlan(raw)
    expect(result.trialPeriodDays).toBe(14)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
