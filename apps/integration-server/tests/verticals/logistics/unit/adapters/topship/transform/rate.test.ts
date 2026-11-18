import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type TopshipRate,
} from '../../../../../../../src/verticals/logistics/adapters/topship/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<TopshipRate> = {}): TopshipRate {
  return {
    mode: 'Express',
    cost: 5000,
    duration: '3 - 5 Business Days',
    currency: 'NGN',
    pricingTier: 'Premium',
    ...overrides,
  }
}

describe('topship transformRate', () => {
  it('maps pricingTier → id', () => {
    const r = transformRate(makeRate())
    expect(r.id).toBe('Premium')
  })

  it('maps mode → serviceCode', () => {
    const r = transformRate(makeRate())
    expect(r.serviceCode).toBe('Express')
  })

  it('falls back to pricingTier for serviceCode when mode absent', () => {
    const r = transformRate(makeRate({ mode: null }))
    expect(r.serviceCode).toBe('Premium')
  })

  it('maps pricingTier → serviceName', () => {
    const r = transformRate(makeRate())
    expect(r.serviceName).toBe('Premium')
  })

  it('maps currency', () => {
    const r = transformRate(makeRate())
    expect(r.currency).toBe('NGN')
  })

  it('maps numeric cost → totalAmount', () => {
    const r = transformRate(makeRate())
    expect(r.totalAmount).toBe(5000)
  })

  it('parses string cost → totalAmount', () => {
    const r = transformRate(makeRate({ cost: '7500' }))
    expect(r.totalAmount).toBe(7500)
  })

  it('parses transit days from "3 - 5 Business Days" as first number (3)', () => {
    const r = transformRate(makeRate())
    expect(r.transitDays).toBe(3)
    expect(r.deliveryDays).toBe(3)
  })

  it('parses "1 Day" as 1', () => {
    const r = transformRate(makeRate({ duration: '1 Day' }))
    expect(r.transitDays).toBe(1)
  })

  it('returns undefined transitDays when duration is null', () => {
    const r = transformRate(makeRate({ duration: null }))
    expect(r.transitDays).toBeUndefined()
  })

  it('metadata references the raw object', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('passes RateSchema validation', () => {
    const result = transformRate(makeRate())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
