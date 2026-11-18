import { describe, it, expect } from 'vitest'
import {
  transformRate,
  transformRateResponse,
  type Smc3RateResult,
  type Smc3RateResponse,
} from '../../../../../../../src/verticals/logistics/adapters/smc3/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<Smc3RateResult> = {}): Smc3RateResult {
  return {
    scac: 'ABCD',
    carrierName: 'ABCD Freight',
    serviceCode: 'ABCD_LTL',
    serviceName: 'Standard LTL',
    totalCharge: 425.75,
    currency: 'USD',
    transitDays: 3,
    estimatedDeliveryDate: '2024-03-01T00:00:00Z',
    guaranteedDelivery: false,
    effectiveDate: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('smc3 transformRate', () => {
  it('maps carrierId from scac', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('ABCD')
  })

  it('maps serviceCode and serviceName', () => {
    const r = transformRate(makeRaw())
    expect(r.serviceCode).toBe('ABCD_LTL')
    expect(r.serviceName).toBe('Standard LTL')
  })

  it('maps totalAmount from totalCharge', () => {
    expect(transformRate(makeRaw()).totalAmount).toBe(425.75)
  })

  it('maps currency', () => {
    expect(transformRate(makeRaw()).currency).toBe('USD')
  })

  it('defaults currency to USD when null', () => {
    expect(transformRate(makeRaw({ currency: null })).currency).toBe('USD')
  })

  it('maps transitDays and deliveryDays', () => {
    const r = transformRate(makeRaw())
    expect(r.transitDays).toBe(3)
    expect(r.deliveryDays).toBe(3)
  })

  it('maps isGuaranteedDelivery from guaranteedDelivery', () => {
    expect(transformRate(makeRaw({ guaranteedDelivery: true })).isGuaranteedDelivery).toBe(true)
    expect(transformRate(makeRaw({ guaranteedDelivery: false })).isGuaranteedDelivery).toBe(false)
  })

  it('maps estimatedDeliveryAt as Date', () => {
    const r = transformRate(makeRaw())
    expect(r.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt from effectiveDate', () => {
    const r = transformRate(makeRaw())
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('preserves metadata as the raw input', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles string totalCharge', () => {
    const r = transformRate(makeRaw({ totalCharge: '312.50' }))
    expect(r.totalAmount).toBe(312.5)
  })

  it('returns undefined totalAmount for null totalCharge', () => {
    expect(transformRate(makeRaw({ totalCharge: null })).totalAmount).toBeUndefined()
  })

  it('falls back serviceName to carrierName', () => {
    const r = transformRate(makeRaw({ serviceName: null }))
    expect(r.serviceName).toBe('ABCD Freight')
  })

  it('does NOT parse as schema-valid Rate — totalAmount is a float but Amount schema requires int (minor-units)', () => {
    // The transform emits a decimal totalCharge (e.g. 425.75) directly, while
    // RateSchema.totalAmount uses the Amount validator which requires a safe integer
    // (minor-units). This is a known schema incompatibility in the source transform.
    expect(() => RateSchema.parse(transformRate(makeRaw()))).toThrow()
  })
})

describe('smc3 transformRateResponse', () => {
  it('maps each rates entry', () => {
    const raw: Smc3RateResponse = {
      rates: [makeRaw({ scac: 'ABCD' }), makeRaw({ scac: 'WXYZ', totalCharge: 500 })],
    }
    const results = transformRateResponse(raw)
    expect(results).toHaveLength(2)
    expect(results[0].carrierId).toBe('ABCD')
    expect(results[1].carrierId).toBe('WXYZ')
  })

  it('returns empty array when rates is null', () => {
    expect(transformRateResponse({ rates: null })).toEqual([])
  })
})
