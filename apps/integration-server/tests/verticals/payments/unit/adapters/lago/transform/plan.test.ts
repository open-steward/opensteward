import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawLagoPlan,
} from '../../../../../../../src/verticals/payments/adapters/lago/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('lago transformPlan', () => {
  it('maps a monthly plan with code, amount, and trial period', () => {
    const raw: RawLagoPlan = {
      lago_id: 'plan-001',
      code: 'pro-monthly',
      name: 'Pro Plan',
      invoice_display_name: 'Pro Monthly',
      interval: 'monthly',
      amount_cents: 2999,
      amount_currency: 'usd',
      trial_period: 14,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('pro-monthly')
    expect(result.interval).toBe('month')
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('USD')
    expect(result.trialPeriodDays).toBe(14)
    expect(result.gateway).toBe('lago')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a quarterly plan to month interval with intervalCount 3', () => {
    const raw: RawLagoPlan = {
      lago_id: 'plan-002',
      code: 'enterprise-quarterly',
      interval: 'quarterly',
      amount_cents: 8900,
      amount_currency: 'EUR',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(3)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps a yearly plan to year interval', () => {
    const raw: RawLagoPlan = {
      lago_id: 'plan-003',
      code: 'starter-yearly',
      interval: 'yearly',
      amount_cents: 19900,
      amount_currency: 'USD',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.intervalCount).toBeUndefined()
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
