import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  untransformLocation,
  type RawShopifyLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopaccino/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeRaw(overrides: Partial<RawShopifyLocation> = {}): RawShopifyLocation {
  return {
    id: 9001,
    name: 'Main Warehouse',
    active: true,
    address1: '200 Commerce Ave',
    address2: 'Suite 5',
    city: 'Chicago',
    zip: '60601',
    province: 'Illinois',
    country: 'United States',
    country_code: 'US',
    phone: '+13125550001',
    legacy: false,
    ...overrides,
  }
}

describe('shopaccino transformLocation', () => {
  it('maps id to string and name', () => {
    const result = transformLocation(makeRaw())
    expect(result.id).toBe('9001')
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps active flag', () => {
    const result = transformLocation(makeRaw())
    expect(result.active).toBe(true)
  })

  it('sets isFulfillmentCenter true for active non-legacy location', () => {
    const result = transformLocation(makeRaw())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('leaves isFulfillmentCenter undefined for legacy location', () => {
    const result = transformLocation(makeRaw({ legacy: true }))
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('maps address fields using country_code over country', () => {
    const result = transformLocation(makeRaw())
    expect(result.address?.line1).toBe('200 Commerce Ave')
    expect(result.address?.city).toBe('Chicago')
    expect(result.address?.postalCode).toBe('60601')
    expect(result.address?.country).toBe('US')
  })

  it('produces output that passes LocationSchema', () => {
    const result = transformLocation(makeRaw())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformLocation', () => {
    const canonical = transformLocation(makeRaw())
    const back = untransformLocation(canonical)
    expect(back.name).toBe('Main Warehouse')
    expect(back.address1).toBe('200 Commerce Ave')
    expect(back.country_code).toBe('US')
  })
})
