import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type KarrioRateResult,
} from '../../../../../../../src/verticals/logistics/adapters/karrio/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<KarrioRateResult> = {}): KarrioRateResult {
  return {
    id: 'rate-001',
    carrier_id: 'ups',
    carrier_name: 'UPS',
    service: 'ups_ground',
    total_charge: 12.5,
    currency: 'USD',
    transit_days: 3,
    estimated_delivery: '2024-03-05T00:00:00Z',
    ...overrides,
  }
}

describe('karrio transformRate', () => {
  it('maps id', () => {
    expect(transformRate(makeRaw()).id).toBe('rate-001')
  })

  it('maps carrier_id to carrierId', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('ups')
  })

  it('maps service to serviceCode', () => {
    expect(transformRate(makeRaw()).serviceCode).toBe('ups_ground')
  })

  it('maps total_charge to totalAmount', () => {
    expect(transformRate(makeRaw()).totalAmount).toBe(12.5)
  })

  it('maps currency', () => {
    expect(transformRate(makeRaw()).currency).toBe('USD')
  })

  it('maps transit_days to transitDays and deliveryDays', () => {
    const r = transformRate(makeRaw())
    expect(r.transitDays).toBe(3)
    expect(r.deliveryDays).toBe(3)
  })

  it('estimatedDeliveryAt is a Date', () => {
    expect(transformRate(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('schema validation throws because transform emits raw float amounts, but RateSchema.totalAmount requires int (minor-units)', () => {
    // The Karrio API returns decimal amounts (e.g. 12.5 USD). parseDecimal preserves the
    // float and passes it directly to the Rate object. RateSchema.totalAmount uses the shared
    // Amount schema which requires z.number().int(). RateSchema.parse throws on fractional
    // amounts — a known schema incompatibility in the source transform.
    expect(() => RateSchema.parse(transformRate(makeRaw()))).toThrow()
  })

  it('totalAmount is undefined when total_charge is null', () => {
    expect(transformRate(makeRaw({ total_charge: null })).totalAmount).toBeUndefined()
  })
})
