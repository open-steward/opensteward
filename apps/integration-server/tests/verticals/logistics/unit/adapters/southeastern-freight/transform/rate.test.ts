import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type SeflRateResponse,
} from '../../../../../../../src/verticals/logistics/adapters/southeastern-freight/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<SeflRateResponse> = {}): SeflRateResponse {
  return {
    quoteNumber: 'Q-SEFL-001',
    status: 'RAT',
    pickupDate: '2024-03-01',
    transitTime: 3,
    rateQuote: 412.5,
    discountPercent: 50,
    discountAmount: 412.5,
    quoteType: 'LTL',
    origCity: 'Columbia',
    origState: 'SC',
    origZip: '29201',
    destCity: 'Charlotte',
    destState: 'NC',
    destZip: '28201',
    ...overrides,
  }
}

describe('southeastern-freight transformRate', () => {
  it('maps id from quoteNumber', () => {
    expect(transformRate(makeRaw()).id).toBe('Q-SEFL-001')
  })

  it('maps carrierId to southeastern-freight', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('southeastern-freight')
  })

  it('maps serviceCode from quoteType', () => {
    expect(transformRate(makeRaw()).serviceCode).toBe('LTL')
  })

  it('maps serviceName from quoteType as SEFL <quoteType>', () => {
    expect(transformRate(makeRaw()).serviceName).toBe('SEFL LTL')
  })

  it('defaults serviceName to SEFL LTL when quoteType is absent', () => {
    expect(transformRate(makeRaw({ quoteType: undefined })).serviceName).toBe('SEFL LTL')
  })

  it('maps currency to USD', () => {
    expect(transformRate(makeRaw()).currency).toBe('USD')
  })

  it('maps totalAmount from rateQuote', () => {
    expect(transformRate(makeRaw()).totalAmount).toBe(412.5)
  })

  it('maps transitDays as ceiling of transitTime', () => {
    // transitTime 3 → transitDays 3
    expect(transformRate(makeRaw()).transitDays).toBe(3)
  })

  it('maps transitDays ceiling for fractional value', () => {
    expect(transformRate(makeRaw({ transitTime: 2.3 })).transitDays).toBe(3)
  })

  it('maps isGuaranteedDelivery to false', () => {
    expect(transformRate(makeRaw()).isGuaranteedDelivery).toBe(false)
  })

  it('sets estimatedDeliveryAt when pickupDate and transitTime are present', () => {
    const r = transformRate(makeRaw())
    expect(r.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('does not set estimatedDeliveryAt when pickupDate is missing', () => {
    const r = transformRate(makeRaw({ pickupDate: undefined }))
    expect(r.estimatedDeliveryAt).toBeUndefined()
  })

  it('does not set estimatedDeliveryAt when transitTime is missing', () => {
    const r = transformRate(makeRaw({ transitTime: undefined }))
    expect(r.estimatedDeliveryAt).toBeUndefined()
  })

  it('sets createdAt to current time', () => {
    const before = new Date()
    const r = transformRate(makeRaw())
    const after = new Date()
    expect(r.createdAt).toBeInstanceOf(Date)
    expect(r.createdAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(r.createdAt!.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('does NOT parse as schema-valid Rate — totalAmount is a float but Amount schema requires int (minor-units)', () => {
    // The transform emits a decimal rateQuote (e.g. 412.5) directly, while
    // RateSchema.totalAmount uses the Amount validator which requires a safe integer.
    // This is a known schema incompatibility in the source transform.
    expect(() => RateSchema.parse(transformRate(makeRaw()))).toThrow()
  })
})
