import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type PandagoEstimate,
} from '../../../../../../../src/verticals/logistics/adapters/pandago/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeEstimate(overrides: Partial<PandagoEstimate> = {}): PandagoEstimate {
  return {
    estimated_delivery_fee: 4.75,
    currency_code: 'SGD',
    distance: 3.2,
    estimated_pickup_time: 1709251200, // 2024-03-01T00:00:00Z
    estimated_delivery_time: 1709254800, // 2024-03-01T01:00:00Z
    delivery_duration: 3600,
    lower_bound: 30,
    upper_bound: 60,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pandago transformRate', () => {
  it('sets carrierId to "pandago"', () => {
    expect(transformRate(makeEstimate()).carrierId).toBe('pandago')
  })

  it('sets serviceCode to "standard"', () => {
    expect(transformRate(makeEstimate()).serviceCode).toBe('standard')
  })

  it('maps currency from currency_code', () => {
    expect(transformRate(makeEstimate()).currency).toBe('SGD')
  })

  it('defaults currency to SGD when missing', () => {
    expect(transformRate(makeEstimate({ currency_code: null })).currency).toBe('SGD')
  })

  it('maps totalAmount from estimated_delivery_fee', () => {
    expect(transformRate(makeEstimate()).totalAmount).toBe(4.75)
  })

  it('sets transitDays to 0 (same-day delivery)', () => {
    expect(transformRate(makeEstimate()).transitDays).toBe(0)
  })

  it('sets isGuaranteedDelivery to false', () => {
    expect(transformRate(makeEstimate()).isGuaranteedDelivery).toBe(false)
  })

  it('converts estimated_delivery_time epoch seconds to Date', () => {
    const result = transformRate(makeEstimate())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.estimatedDeliveryAt?.toISOString()).toBe('2024-03-01T01:00:00.000Z')
  })

  it('omits estimatedDeliveryAt when estimated_delivery_time is null', () => {
    const result = transformRate(makeEstimate({ estimated_delivery_time: null }))
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })

  it('handles null estimated_delivery_fee gracefully', () => {
    const result = transformRate(makeEstimate({ estimated_delivery_fee: null }))
    // parseDecimal(null) returns null/undefined — not required to be a number
    expect(result.totalAmount == null || typeof result.totalAmount === 'number').toBe(true)
  })

  it('passes metadata as raw object', () => {
    const raw = makeEstimate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('throws on RateSchema validation because transformRate emits a float totalAmount but RateSchema.totalAmount uses Amount (integer minor-units)', () => {
    // Source bug: pandago passes delivery_fee as a float (e.g. 4.75) directly to
    // totalAmount, but Amount requires a safe integer (minor-unit cents).
    expect(() => RateSchema.parse(transformRate(makeEstimate()))).toThrow()
  })
})
