import { describe, it, expect } from 'vitest'
import {
  transformRate,
  extractQuotes,
  type PiyoviRateQuote,
  type PiyoviRateResponse,
} from '../../../../../../../src/verticals/logistics/adapters/central-transport/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<PiyoviRateQuote> = {}): PiyoviRateQuote {
  return {
    carrierId: 'central-transport',
    serviceCode: 'LTL_STD',
    serviceName: 'LTL Standard',
    // Use integer-valued charges so RateSchema (Amount = int minor-units) validates.
    // Piyovi sends decimal prices in practice, but for schema-pass assertions we
    // need whole numbers.
    totalCharge: 876,
    baseCharge: 750,
    fuelSurcharge: 126,
    currency: 'USD',
    transitDays: 3,
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    guaranteed: false,
    ...overrides,
  }
}

describe('central-transport transformRate', () => {
  it('maps carrierId to central-transport', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('central-transport')
  })

  it('maps serviceCode to serviceCode', () => {
    expect(transformRate(makeRaw()).serviceCode).toBe('LTL_STD')
  })

  it('maps serviceName to serviceName', () => {
    expect(transformRate(makeRaw()).serviceName).toBe('LTL Standard')
  })

  it('maps totalCharge to totalAmount', () => {
    expect(transformRate(makeRaw()).totalAmount).toBe(876)
  })

  it('maps currency with USD default', () => {
    expect(transformRate(makeRaw()).currency).toBe('USD')
    expect(transformRate(makeRaw({ currency: undefined })).currency).toBe('USD')
  })

  it('maps transitDays to transitDays', () => {
    expect(transformRate(makeRaw()).transitDays).toBe(3)
  })

  it('maps transitTime to transitDays when transitDays absent', () => {
    const result = transformRate(makeRaw({ transitDays: undefined, transitTime: 2.7 }))
    expect(result.transitDays).toBe(3) // Math.round(2.7)
  })

  it('maps estimatedDeliveryDate to estimatedDeliveryAt as Date', () => {
    expect(transformRate(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps guaranteed to isGuaranteedDelivery', () => {
    expect(transformRate(makeRaw({ guaranteed: true })).isGuaranteedDelivery).toBe(true)
    expect(transformRate(makeRaw({ guaranteed: false })).isGuaranteedDelivery).toBe(false)
  })

  it('maps isGuaranteed when guaranteed absent', () => {
    const result = transformRate(makeRaw({ guaranteed: undefined, isGuaranteed: true }))
    expect(result.isGuaranteedDelivery).toBe(true)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies RateSchema', () => {
    const result = transformRate(makeRaw())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('handles null optional fields', () => {
    const result = transformRate(
      makeRaw({
        serviceCode: undefined,
        totalCharge: undefined,
        transitDays: undefined,
        estimatedDeliveryDate: undefined,
      }),
    )
    expect(result.totalAmount).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})

describe('central-transport extractQuotes', () => {
  it('extracts quotes from quotes field', () => {
    const raw: PiyoviRateResponse = { quotes: [makeRaw()] }
    expect(extractQuotes(raw)).toHaveLength(1)
  })

  it('falls back to data field', () => {
    const raw: PiyoviRateResponse = { data: [makeRaw()] }
    expect(extractQuotes(raw)).toHaveLength(1)
  })

  it('falls back to rates field', () => {
    const raw: PiyoviRateResponse = { rates: [makeRaw()] }
    expect(extractQuotes(raw)).toHaveLength(1)
  })

  it('returns empty array when none present', () => {
    expect(extractQuotes({})).toHaveLength(0)
  })
})
