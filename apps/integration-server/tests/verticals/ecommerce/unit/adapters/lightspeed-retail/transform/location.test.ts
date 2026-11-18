import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  untransformLocation,
  type RawLightspeedShop,
} from '../../../../../../../src/verticals/ecommerce/adapters/lightspeed-retail/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeShop(overrides: Partial<RawLightspeedShop> = {}): RawLightspeedShop {
  return {
    shopID: '1',
    name: 'Downtown Store',
    address1: '123 Main St',
    address2: 'Suite 4',
    city: 'Portland',
    state: 'OR',
    zip: '97201',
    country: 'US',
    phone: '503-555-0100',
    timeZone: 'America/Los_Angeles',
    timeStamp: '2024-02-20T10:00:00+00:00',
    ...overrides,
  }
}

describe('transformLocation (Lightspeed Retail)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeShop())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Downtown Store')
    expect(result.active).toBe(true)
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('maps address fields', () => {
    const result = transformLocation(makeShop())
    expect(result.address?.line1).toBe('123 Main St')
    expect(result.address?.line2).toBe('Suite 4')
    expect(result.address?.city).toBe('Portland')
    expect(result.address?.region).toBe('OR')
    expect(result.address?.postalCode).toBe('97201')
    expect(result.address?.country).toBe('US')
  })

  it('maps phone', () => {
    const result = transformLocation(makeShop())
    expect(result.phone).toBe('503-555-0100')
  })

  it('returns undefined address when all fields are empty', () => {
    const result = transformLocation(
      makeShop({ address1: undefined, city: undefined, zip: undefined, country: undefined }),
    )
    expect(result.address).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeShop()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeShop())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformLocation', () => {
    const canonical = transformLocation(makeShop())
    const raw = untransformLocation(canonical)
    expect(raw['name']).toBe('Downtown Store')
    expect(raw['address1']).toBe('123 Main St')
    expect(raw['city']).toBe('Portland')
  })
})
