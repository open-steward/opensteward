import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type TrackingMoreCourier,
} from '../../../../../../../src/verticals/logistics/adapters/trackingmore/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeRaw(overrides: Partial<TrackingMoreCourier> = {}): TrackingMoreCourier {
  return {
    courier_code: 'ups',
    courier_name: 'UPS',
    web_url: 'https://www.ups.com',
    phone: '+18005551234',
    required_fields: ['tracking_number'],
    type: 'express',
    country_code: 'US',
    ...overrides,
  }
}

describe('trackingmore transformCarrier', () => {
  it('maps courier_code to id, name, and code', () => {
    const result = transformCarrier(makeRaw())
    expect(result.id).toBe('ups')
    expect(result.name).toBe('UPS')
    expect(result.code).toBe('ups')
  })

  it('sets isActive to true unconditionally', () => {
    expect(transformCarrier(makeRaw()).isActive).toBe(true)
  })

  it('populates metadata with the raw object', () => {
    const raw = makeRaw()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('passes CarrierSchema.parse without throwing', () => {
    const result = transformCarrier(makeRaw())
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })

  it('handles null courier_code gracefully — id and code become undefined', () => {
    const result = transformCarrier(makeRaw({ courier_code: null }))
    expect(result.id).toBeUndefined()
    expect(result.code).toBeUndefined()
  })

  it('handles null courier_name gracefully', () => {
    const result = transformCarrier(makeRaw({ courier_name: null }))
    expect(result.name).toBeUndefined()
  })

  it('still passes schema with all nulls', () => {
    const result = transformCarrier(makeRaw({ courier_code: null, courier_name: null }))
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
