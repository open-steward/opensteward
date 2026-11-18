import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawIyzicoplan,
} from '../../../../../../../src/verticals/payments/adapters/iyzico/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('iyzico transformPlan', () => {
  it('maps MONTHLY plan with ACTIVE status and converts price', () => {
    const raw: RawIyzicoplan = {
      referenceCode: 'plan-ref-001',
      name: 'Pro Monthly',
      productReferenceCode: 'prod-ref-001',
      price: 49.99,
      currencyCode: 'TRY',
      paymentInterval: 'MONTHLY',
      paymentIntervalCount: 1,
      status: 'ACTIVE',
      createdDate: '2024-03-01T00:00:00Z',
    }
    const result = transformPlan(raw)
    expect(result.id).toBe('plan-ref-001')
    expect(result.nickname).toBe('Pro Monthly')
    expect(result.active).toBe(true)
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('TRY')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('iyzico')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps YEARLY interval', () => {
    const raw: RawIyzicoplan = {
      referenceCode: 'plan-ref-002',
      name: 'Enterprise Annual',
      price: 499.0,
      currencyCode: 'USD',
      paymentInterval: 'YEARLY',
      paymentIntervalCount: 1,
      status: 'ACTIVE',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('year')
    expect(result.amount).toBe(49900)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('maps WEEKLY interval', () => {
    const raw: RawIyzicoplan = {
      referenceCode: 'plan-ref-003',
      price: 9.99,
      currencyCode: 'EUR',
      paymentInterval: 'WEEKLY',
      status: 'ACTIVE',
    }
    const result = transformPlan(raw)
    expect(result.interval).toBe('week')
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })

  it('includes trialPeriodDays when present', () => {
    const raw: RawIyzicoplan = {
      referenceCode: 'plan-ref-004',
      price: 29.99,
      currencyCode: 'TRY',
      paymentInterval: 'MONTHLY',
      status: 'ACTIVE',
      trialPeriodDays: 14,
    }
    const result = transformPlan(raw)
    expect(result.trialPeriodDays).toBe(14)
    expect(() => PlanSchema.parse(result)).not.toThrow()
  })
})
