import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawFlutterwavePlan,
} from '../../../../../../../src/verticals/payments/adapters/flutterwave/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('flutterwave transformPlan', () => {
  it('maps a monthly active plan', () => {
    const raw: RawFlutterwavePlan = {
      id: 301,
      name: 'Pro Monthly',
      amount: 29.99,
      currency: 'NGN',
      interval: 'monthly',
      status: 'active',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('301')
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.interval).toBe('month')
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('NGN')
    expect(result.active).toBe(true)
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('flutterwave')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a daily interval', () => {
    const raw: RawFlutterwavePlan = {
      id: 302,
      name: 'Daily Plan',
      amount: 1.0,
      currency: 'USD',
      interval: 'daily',
      status: 'active',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('day')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a weekly interval', () => {
    const raw: RawFlutterwavePlan = {
      id: 303,
      name: 'Weekly Plan',
      amount: 5.0,
      currency: 'NGN',
      interval: 'weekly',
      status: 'active',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps yearly and annually intervals to "year"', () => {
    const raw1: RawFlutterwavePlan = {
      id: 304,
      name: 'Yearly',
      amount: 100,
      currency: 'USD',
      interval: 'yearly',
      status: 'active',
    }
    const raw2: RawFlutterwavePlan = {
      id: 305,
      name: 'Annual',
      amount: 100,
      currency: 'USD',
      interval: 'annually',
      status: 'active',
    }
    expect(transformPlan(raw1).interval).toBe('year')
    expect(transformPlan(raw2).interval).toBe('year')
  })

  it('converts decimal amount to minor units', () => {
    const raw: RawFlutterwavePlan = {
      id: 306,
      name: 'Test Plan',
      amount: 10.5,
      currency: 'NGN',
      interval: 'monthly',
      status: 'active',
    }
    const result = transformPlan(raw)
    expect(result.amount).toBe(1050)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('stores interval in metadata', () => {
    const raw: RawFlutterwavePlan = {
      id: 307,
      name: 'Meta Plan',
      amount: 20.0,
      currency: 'NGN',
      interval: 'monthly',
      status: 'active',
    }
    const result = transformPlan(raw)
    expect(result.metadata['interval']).toBe('monthly')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
