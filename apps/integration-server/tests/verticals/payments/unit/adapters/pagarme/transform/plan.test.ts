import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawPagarmePlan,
} from '../../../../../../../src/verticals/payments/adapters/pagarme/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('pagarme transformPlan', () => {
  it('maps core plan fields to canonical plan', () => {
    const raw: RawPagarmePlan = {
      id: 'plan_abc',
      name: 'Monthly Pro',
      status: 'active',
      interval: 'month',
      interval_count: 1,
      currency: 'brl',
      trial_period_days: 7,
      items: [{ id: 'item_1', pricing_scheme: { price: 9900 } }],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-02-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan_abc')
    expect(result.externalId).toBe('plan_abc')
    expect(result.nickname).toBe('Monthly Pro')
    expect(result.active).toBe(true)
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('BRL')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.trialPeriodDays).toBe(7)
    expect(result.gateway).toBe('pagarme')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps inactive plan active=false', () => {
    const raw: RawPagarmePlan = {
      id: 'plan_inactive',
      name: 'Old Plan',
      status: 'inactive',
      interval: 'year',
      currency: 'brl',
      minimum_price: 50000,
    }
    const result = transformPlan(raw)
    expect(result.active).toBe(false)
    expect(result.interval).toBe('year')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('falls back to minimum_price when items have no pricing_scheme', () => {
    const raw: RawPagarmePlan = {
      id: 'plan_minprice',
      name: 'Fallback',
      status: 'active',
      interval: 'month',
      minimum_price: 4990,
      currency: 'brl',
    }
    const result = transformPlan(raw)
    expect(result.amount).toBe(4990)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('falls back to 0 when no items and no minimum_price', () => {
    const raw: RawPagarmePlan = {
      id: 'plan_zero',
      name: 'Free',
      status: 'active',
      interval: 'month',
      currency: 'brl',
    }
    const result = transformPlan(raw)
    expect(result.amount).toBe(0)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps week and day intervals correctly', () => {
    const week: RawPagarmePlan = {
      id: 'plan_w',
      name: 'Weekly',
      status: 'active',
      interval: 'week',
      currency: 'brl',
    }
    const day: RawPagarmePlan = {
      id: 'plan_d',
      name: 'Daily',
      status: 'active',
      interval: 'day',
      currency: 'brl',
    }
    expect(transformPlan(week).interval).toBe('week')
    expect(transformPlan(day).interval).toBe('day')
    expect(() => PlanSchema.parse(transformPlan(week))).not.toThrow()
    expect(() => PlanSchema.parse(transformPlan(day))).not.toThrow()
  })

  it('puts description and billing_type into metadata', () => {
    const raw: RawPagarmePlan = {
      id: 'plan_meta',
      name: 'Meta Plan',
      status: 'active',
      interval: 'month',
      currency: 'brl',
      description: 'A great plan',
      billing_type: 'prepaid',
      statement_descriptor: 'GREATPLAN',
    }
    const result = transformPlan(raw)
    expect(result.metadata['description']).toBe('A great plan')
    expect(result.metadata['billing_type']).toBe('prepaid')
    expect(result.metadata['statement_descriptor']).toBe('GREATPLAN')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
