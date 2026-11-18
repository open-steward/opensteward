import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  untransformLocation,
  type RawSquareLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/square/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawSquareLocation> = {}): RawSquareLocation {
  return {
    id: 'LOC_MAIN',
    name: 'Downtown Cafe',
    status: 'ACTIVE',
    address: {
      address_line_1: '123 Main St',
      address_line_2: 'Suite 4',
      locality: 'San Francisco',
      administrative_district_level_1: 'CA',
      postal_code: '94105',
      country: 'US',
    },
    coordinates: { latitude: 37.7749, longitude: -122.4194 },
    phone_number: '+1 415 555 1234',
    timezone: 'America/Los_Angeles',
    type: 'PHYSICAL',
    currency: 'USD',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLocation (Square)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('LOC_MAIN')
    expect(result.name).toBe('Downtown Cafe')
    expect(result.active).toBe(true)
    expect(result.phone).toBe('+1 415 555 1234')
  })

  it('maps nested address fields', () => {
    const result = transformLocation(makeLocation())
    expect(result.address?.line1).toBe('123 Main St')
    expect(result.address?.line2).toBe('Suite 4')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.region).toBe('CA')
    expect(result.address?.postalCode).toBe('94105')
    expect(result.address?.country).toBe('US')
  })

  it('marks PHYSICAL locations as fulfillment centers', () => {
    const result = transformLocation(makeLocation())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('marks INACTIVE locations correctly', () => {
    const result = transformLocation(makeLocation({ status: 'INACTIVE' }))
    expect(result.active).toBe(false)
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

  it('round-trips writable fields via untransformLocation', () => {
    const canonical = transformLocation(makeLocation())
    const raw = untransformLocation(canonical)
    expect(raw['name']).toBe('Downtown Cafe')
    expect(raw['status']).toBe('ACTIVE')
    expect((raw['address'] as Record<string, unknown>)['address_line_1']).toBe('123 Main St')
  })
})
