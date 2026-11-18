import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawShoplazzaLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoplazza/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeRaw(overrides: Partial<RawShoplazzaLocation> = {}): RawShoplazzaLocation {
  return {
    id: 60001,
    name: 'Shoplazza Warehouse HQ',
    active: true,
    address1: '1 Commerce Street',
    address2: 'Floor 5',
    city: 'Guangzhou',
    zip: '510000',
    province: 'Guangdong',
    country: 'China',
    country_code: 'CN',
    phone: '+8620123456',
    created_at: '2023-01-01T00:00:00.000Z',
    updated_at: '2024-04-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('shoplazza transformLocation', () => {
  it('maps id to string', () => {
    const result = transformLocation(makeRaw())
    expect(result.id).toBe('60001')
  })

  it('maps name', () => {
    const result = transformLocation(makeRaw())
    expect(result.name).toBe('Shoplazza Warehouse HQ')
  })

  it('maps active flag', () => {
    const result = transformLocation(makeRaw())
    expect(result.active).toBe(true)
  })

  it('sets isFulfillmentCenter true when active is true', () => {
    const result = transformLocation(makeRaw())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('sets isFulfillmentCenter undefined when active is false', () => {
    const result = transformLocation(makeRaw({ active: false }))
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('maps address fields using country_code over country', () => {
    const result = transformLocation(makeRaw())
    expect(result.address?.line1).toBe('1 Commerce Street')
    expect(result.address?.line2).toBe('Floor 5')
    expect(result.address?.city).toBe('Guangzhou')
    expect(result.address?.postalCode).toBe('510000')
    expect(result.address?.country).toBe('CN')
    expect(result.address?.region).toBe('Guangdong')
  })

  it('produces output that passes LocationSchema', () => {
    const result = transformLocation(makeRaw())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
