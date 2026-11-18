import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawEbayLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/ebay/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawEbayLocation> = {}): RawEbayLocation {
  return {
    merchantLocationKey: 'WH-NYC-01',
    name: 'NYC Warehouse',
    merchantLocationStatus: 'ENABLED',
    location: {
      address: {
        addressLine1: '100 Fulton St',
        addressLine2: 'Suite 500',
        city: 'New York',
        stateOrProvince: 'NY',
        postalCode: '10038',
        country: 'US',
      },
    },
    locationTypes: ['WAREHOUSE'],
    phone: '+1-212-555-0100',
    ...overrides,
  }
}

describe('transformLocation (eBay)', () => {
  it('uses merchantLocationKey as the canonical id', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('WH-NYC-01')
    expect(result.name).toBe('NYC Warehouse')
  })

  it('maps ENABLED status to active=true', () => {
    expect(transformLocation(makeLocation()).active).toBe(true)
    expect(
      transformLocation(makeLocation({ merchantLocationStatus: 'DISABLED' })).active,
    ).toBe(false)
  })

  it('maps the eBay address to canonical address', () => {
    const result = transformLocation(makeLocation())
    expect(result.address).toEqual({
      line1: '100 Fulton St',
      line2: 'Suite 500',
      city: 'New York',
      region: 'NY',
      postalCode: '10038',
      country: 'US',
    })
  })

  it('maps WAREHOUSE to isFulfillmentCenter=true', () => {
    expect(transformLocation(makeLocation()).isFulfillmentCenter).toBe(true)
    expect(
      transformLocation(makeLocation({ locationTypes: ['STORE'] })).isFulfillmentCenter,
    ).toBeFalsy()
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })
})
