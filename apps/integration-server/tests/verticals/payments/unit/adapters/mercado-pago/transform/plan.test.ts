import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawMPPreapprovalPlan,
} from '../../../../../../../src/verticals/payments/adapters/mercado-pago/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('mercado-pago transformPlan', () => {
  const base: RawMPPreapprovalPlan = {
    id: 'plan-xyz-789',
    reason: 'Pro Monthly',
    status: 'active',
    auto_recurring: {
      transaction_amount: 49.99,
      currency_id: 'ARS',
      frequency: 1,
      frequency_type: 'months',
      repetitions: 12,
    },
    date_created: '2023-01-01T00:00:00.000Z',
    last_modified: '2023-06-01T00:00:00.000Z',
  }

  it('maps id and nickname from reason', () => {
    const result = transformPlan(base)
    expect(result.id).toBe('plan-xyz-789')
    expect(result.nickname).toBe('Pro Monthly')
  })

  it('maps active status to true', () => {
    const result = transformPlan(base)
    expect(result.active).toBe(true)
  })

  it('converts transaction_amount to minor units', () => {
    const result = transformPlan(base)
    expect(result.amount).toBe(4999) // 49.99 * 100
  })

  it('maps currency from auto_recurring.currency_id', () => {
    const result = transformPlan(base)
    expect(result.currency).toBe('ARS')
  })

  it('maps months frequency_type to month interval', () => {
    const result = transformPlan(base)
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
  })

  it('maps days frequency_type to day interval', () => {
    const result = transformPlan({
      ...base,
      auto_recurring: { ...base.auto_recurring, frequency_type: 'days', frequency: 7 },
    })
    expect(result.interval).toBe('day')
    expect(result.intervalCount).toBe(7)
  })

  it('maps years frequency_type to year interval', () => {
    const result = transformPlan({
      ...base,
      auto_recurring: { ...base.auto_recurring, frequency_type: 'years', frequency: 1 },
    })
    expect(result.interval).toBe('year')
  })

  it('puts repetitions in metadata', () => {
    const result = transformPlan(base)
    expect(result.metadata['repetitions']).toBe('12')
  })

  it('sets gateway to mercado-pago', () => {
    const result = transformPlan(base)
    expect(result.gateway).toBe('mercado-pago')
  })

  it('inactive status maps to active: false', () => {
    const result = transformPlan({ ...base, status: 'inactive' })
    expect(result.active).toBe(false)
  })

  it('conforms to PlanSchema', () => {
    expect(() => PlanSchema.parse(transformPlan(base))).not.toThrow()
  })
})
