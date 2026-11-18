import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawFabricLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/fabric/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawFabricLocation> = {}): RawFabricLocation {
  return {
    id: 'loc-001',
    name: 'Main Warehouse',
    is_active: true,
    is_fulfillment_center: true,
    phone: '+1-555-0100',
    address: {
      line1: '123 Commerce St',
      line2: 'Suite 100',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94105',
      country: 'US',
    },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLocation (fabric)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('loc-001')
    expect(result.name).toBe('Main Warehouse')
    expect(result.active).toBe(true)
    expect(result.isFulfillmentCenter).toBe(true)
    expect(result.phone).toBe('+1-555-0100')
  })

  it('maps address', () => {
    const result = transformLocation(makeLocation())
    expect(result.address).toEqual({
      line1: '123 Commerce St',
      line2: 'Suite 100',
      city: 'San Francisco',
      region: 'CA',
      postalCode: '94105',
      country: 'US',
    })
  })

  it('handles missing address', () => {
    const result = transformLocation(makeLocation({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
