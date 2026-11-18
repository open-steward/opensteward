import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type CHRRateResponse,
} from '../../../../../../../src/verticals/logistics/adapters/ch-robinson/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<CHRRateResponse> = {}): CHRRateResponse {
  return {
    quoteId: 'QUOTE-001',
    rateId: 'RATE-001',
    serviceCode: 'LTL_STD',
    serviceName: 'LTL Standard',
    serviceType: 'LTL',
    totalCharges: 1200.0,
    lineHaulCharges: 900.0,
    fuelCharges: 300.0,
    currency: 'USD',
    transitDays: 3,
    estimatedPickupDate: '2024-03-01T00:00:00Z',
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    isGuaranteed: false,
    ...overrides,
  }
}

describe('ch-robinson transformRate', () => {
  it('maps quoteId to id', () => {
    expect(transformRate(makeRaw()).id).toBe('QUOTE-001')
  })

  it('falls back to rateId when quoteId absent', () => {
    expect(transformRate(makeRaw({ quoteId: undefined })).id).toBe('RATE-001')
  })

  it('maps carrierId to ch-robinson', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('ch-robinson')
  })

  it('maps serviceCode to serviceCode', () => {
    expect(transformRate(makeRaw()).serviceCode).toBe('LTL_STD')
  })

  it('falls back to serviceType when serviceCode absent', () => {
    expect(transformRate(makeRaw({ serviceCode: undefined })).serviceCode).toBe('LTL')
  })

  it('maps serviceName to serviceName', () => {
    expect(transformRate(makeRaw()).serviceName).toBe('LTL Standard')
  })

  it('maps totalCharges to totalAmount', () => {
    expect(transformRate(makeRaw()).totalAmount).toBeCloseTo(1200.0)
  })

  it('maps lineHaulCharges to retailAmount', () => {
    expect(transformRate(makeRaw()).retailAmount).toBeCloseTo(900.0)
  })

  it('maps currency with USD default', () => {
    expect(transformRate(makeRaw()).currency).toBe('USD')
    expect(transformRate(makeRaw({ currency: undefined })).currency).toBe('USD')
  })

  it('maps transitDays to transitDays', () => {
    expect(transformRate(makeRaw()).transitDays).toBe(3)
  })

  it('maps estimatedDeliveryDate to estimatedDeliveryAt as Date', () => {
    expect(transformRate(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps isGuaranteed to isGuaranteedDelivery', () => {
    expect(transformRate(makeRaw({ isGuaranteed: true })).isGuaranteedDelivery).toBe(true)
    expect(transformRate(makeRaw({ isGuaranteed: false })).isGuaranteedDelivery).toBe(false)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies RateSchema', () => {
    const result = transformRate(makeRaw())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields', () => {
    const result = transformRate(
      makeRaw({
        quoteId: undefined,
        rateId: undefined,
        serviceCode: undefined,
        serviceType: undefined,
        totalCharges: undefined,
        transitDays: undefined,
        estimatedDeliveryDate: undefined,
      }),
    )
    expect(result.id).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
