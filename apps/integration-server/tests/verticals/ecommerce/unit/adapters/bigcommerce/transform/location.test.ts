import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  syntheticDefaultLocation,
  type RawBigCommerceLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcommerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawBigCommerceLocation> = {}): RawBigCommerceLocation {
  return {
    id: 1,
    code: 'WAREHOUSE-01',
    label: 'Main Warehouse',
    enabled: true,
    type_id: 'PHYSICAL',
    address: {
      address1: '123 Commerce St',
      address2: 'Suite 200',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      country_code: 'US',
      phone: '+1 512 555 0100',
    },
    ...overrides,
  }
}

describe('transformLocation', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('1')
    expect(typeof result.id).toBe('string')
    expect(result.name).toBe('Main Warehouse')
    expect(result.active).toBe(true)
    expect(result.phone).toBe('+1 512 555 0100')
  })

  it('maps nested address fields', () => {
    const result = transformLocation(makeLocation())
    expect(result.address?.line1).toBe('123 Commerce St')
    expect(result.address?.line2).toBe('Suite 200')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.postalCode).toBe('78701')
    expect(result.address?.country).toBe('US')
  })

  it('marks PHYSICAL locations as fulfillment centres', () => {
    const result = transformLocation(makeLocation())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('does not mark VIRTUAL locations as fulfillment centres', () => {
    const result = transformLocation(makeLocation({ type_id: 'VIRTUAL' }))
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('syntheticDefaultLocation', () => {
  it('returns a default location with id "default"', () => {
    const result = syntheticDefaultLocation()
    expect(result.id).toBe('default')
    expect(result.name).toBe('Default Location')
    expect(result.active).toBe(true)
  })

  it('satisfies LocationSchema', () => {
    const result = syntheticDefaultLocation()
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
