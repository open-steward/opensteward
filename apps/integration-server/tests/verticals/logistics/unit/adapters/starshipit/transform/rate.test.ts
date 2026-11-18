import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type StarshipitRate,
} from '../../../../../../../src/verticals/logistics/adapters/starshipit/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<StarshipitRate> = {}): StarshipitRate {
  return {
    service_name: 'Parcel Post',
    service_code: 'AP_PARCEL',
    carrier_name: 'Australia Post',
    carrier_code: 'auspost',
    price: 12.5,
    currency: 'AUD',
    estimated_transit_days: 3,
    transit_days: 3,
    guaranteed: false,
    ...overrides,
  }
}

describe('starshipit transformRate', () => {
  it('maps carrierId from carrier_code', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('auspost')
  })

  it('falls back carrierId to carrier_name when carrier_code is null', () => {
    expect(transformRate(makeRaw({ carrier_code: null })).carrierId).toBe('Australia Post')
  })

  it('maps serviceCode from service_code', () => {
    expect(transformRate(makeRaw()).serviceCode).toBe('AP_PARCEL')
  })

  it('falls back serviceCode to service_name when service_code is null', () => {
    expect(transformRate(makeRaw({ service_code: null })).serviceCode).toBe('Parcel Post')
  })

  it('maps serviceName from service_name', () => {
    expect(transformRate(makeRaw()).serviceName).toBe('Parcel Post')
  })

  it('maps currency from currency', () => {
    expect(transformRate(makeRaw()).currency).toBe('AUD')
  })

  it('defaults currency to AUD when null', () => {
    expect(transformRate(makeRaw({ currency: null })).currency).toBe('AUD')
  })

  it('maps totalAmount from price', () => {
    expect(transformRate(makeRaw()).totalAmount).toBe(12.5)
  })

  it('handles string price', () => {
    expect(transformRate(makeRaw({ price: '9.95' })).totalAmount).toBe(9.95)
  })

  it('maps transitDays from transit_days', () => {
    expect(transformRate(makeRaw()).transitDays).toBe(3)
  })

  it('falls back transitDays to estimated_transit_days when transit_days is null', () => {
    expect(transformRate(makeRaw({ transit_days: null })).transitDays).toBe(3)
  })

  it('maps deliveryDays same as transitDays', () => {
    expect(transformRate(makeRaw()).deliveryDays).toBe(3)
  })

  it('maps isGuaranteedDelivery from guaranteed', () => {
    expect(transformRate(makeRaw({ guaranteed: true })).isGuaranteedDelivery).toBe(true)
    expect(transformRate(makeRaw({ guaranteed: false })).isGuaranteedDelivery).toBe(false)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('does NOT parse as schema-valid Rate — totalAmount is a float but Amount schema requires int (minor-units)', () => {
    // The transform emits decimal price (e.g. 12.5) directly as totalAmount, while
    // RateSchema.totalAmount uses Amount which requires a safe integer (minor-units).
    // This is a known schema incompatibility in the source transform.
    expect(() => RateSchema.parse(transformRate(makeRaw()))).toThrow()
  })
})
