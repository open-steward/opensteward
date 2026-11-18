import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawShoplineLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopline/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeRaw(overrides: Partial<RawShoplineLocation> = {}): RawShoplineLocation {
  return {
    id: 222,
    name: 'San Francisco Warehouse',
    active: true,
    address1: '100 Market St',
    address2: 'Suite 200',
    city: 'San Francisco',
    zip: '94105',
    province: 'California',
    province_code: 'CA',
    country: 'United States',
    country_code: 'US',
    phone: '+14155550100',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-06-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('transformLocation', () => {
  it('maps id and name', () => {
    const result = transformLocation(makeRaw())
    expect(result.id).toBe('222')
    expect(result.name).toBe('San Francisco Warehouse')
  })

  it('maps active and phone', () => {
    const result = transformLocation(makeRaw())
    expect(result.active).toBe(true)
    expect(result.phone).toBe('+14155550100')
  })

  it('marks active location as fulfillment center', () => {
    const result = transformLocation(makeRaw({ active: true }))
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('does not mark inactive location as fulfillment center', () => {
    const result = transformLocation(makeRaw({ active: false }))
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('maps full address', () => {
    const result = transformLocation(makeRaw())
    expect(result.address?.line1).toBe('100 Market St')
    expect(result.address?.line2).toBe('Suite 200')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.postalCode).toBe('94105')
    expect(result.address?.country).toBe('US')
  })

  it('prefers country_code over country for address.country', () => {
    const result = transformLocation(makeRaw({ country_code: 'US', country: 'United States' }))
    expect(result.address?.country).toBe('US')
  })

  it('prefers province over province_code for region', () => {
    const result = transformLocation(makeRaw())
    expect(result.address?.region).toBe('California')
  })

  it('falls back to province_code when province absent', () => {
    const result = transformLocation(makeRaw({ province: null, province_code: 'CA' }))
    expect(result.address?.region).toBe('CA')
  })

  it('returns undefined address when all address fields empty', () => {
    const result = transformLocation(
      makeRaw({
        address1: null,
        address2: null,
        city: null,
        zip: null,
        province: null,
        province_code: null,
        country: null,
        country_code: null,
      }),
    )
    expect(result.address).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRaw()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies LocationSchema', () => {
    const result = transformLocation(makeRaw())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
