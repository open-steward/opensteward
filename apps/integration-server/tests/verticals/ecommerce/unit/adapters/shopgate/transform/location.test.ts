import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawShopgateLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopgate/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeRaw(overrides: Partial<RawShopgateLocation> = {}): RawShopgateLocation {
  return {
    code: 'WH-EAST',
    name: 'East Warehouse',
    isActive: true,
    isFulfillmentLocation: true,
    street1: '100 Industrial Blvd',
    street2: 'Unit B',
    city: 'Atlanta',
    state: 'GA',
    zip: '30301',
    countryCode: 'US',
    phone: '+14045550001',
    createdAt: '2022-03-01T00:00:00.000Z',
    updatedAt: '2024-01-15T08:00:00.000Z',
    ...overrides,
  }
}

describe('shopgate transformLocation', () => {
  it('uses code as id', () => {
    const result = transformLocation(makeRaw())
    expect(result.id).toBe('WH-EAST')
  })

  it('maps name', () => {
    const result = transformLocation(makeRaw())
    expect(result.name).toBe('East Warehouse')
  })

  it('maps isActive to active', () => {
    const result = transformLocation(makeRaw())
    expect(result.active).toBe(true)
  })

  it('maps isFulfillmentLocation to isFulfillmentCenter', () => {
    const result = transformLocation(makeRaw())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('maps street1 → line1, street2 → line2, zip → postalCode, countryCode → country', () => {
    const result = transformLocation(makeRaw())
    expect(result.address?.line1).toBe('100 Industrial Blvd')
    expect(result.address?.line2).toBe('Unit B')
    expect(result.address?.city).toBe('Atlanta')
    expect(result.address?.postalCode).toBe('30301')
    expect(result.address?.country).toBe('US')
    expect(result.address?.region).toBe('GA')
  })

  it('maps phone', () => {
    const result = transformLocation(makeRaw())
    expect(result.phone).toBe('+14045550001')
  })

  it('produces output that passes LocationSchema', () => {
    const result = transformLocation(makeRaw())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
