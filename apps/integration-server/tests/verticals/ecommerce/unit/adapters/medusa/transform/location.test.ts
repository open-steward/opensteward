import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  untransformLocation,
  type RawMedusaStockLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/medusa/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(
  overrides: Partial<RawMedusaStockLocation> = {},
): RawMedusaStockLocation {
  return {
    id: 'sloc_01',
    name: 'Main Warehouse',
    address: {
      address_1: '123 Commerce St',
      address_2: 'Suite 100',
      city: 'Stockholm',
      province: 'Stockholm County',
      postal_code: '11120',
      country_code: 'SE',
      phone: '+46 8 123 456',
    },
    created_at: '2024-01-10T12:00:00Z',
    updated_at: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformLocation (Medusa v2)', () => {
  it('maps core fields and address', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('sloc_01')
    expect(result.name).toBe('Main Warehouse')
    expect(result.active).toBe(true)
    expect(result.isFulfillmentCenter).toBe(true)
    expect(result.address).toEqual({
      line1: '123 Commerce St',
      line2: 'Suite 100',
      city: 'Stockholm',
      region: 'Stockholm County',
      postalCode: '11120',
      country: 'SE',
    })
    expect(result.phone).toBe('+46 8 123 456')
  })

  it('handles location without address', () => {
    const result = transformLocation(makeLocation({ address: null }))
    expect(result.address).toBeUndefined()
    expect(result.phone).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformLocation(makeLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformLocation', () => {
    const canonical = transformLocation(makeLocation())
    const body = untransformLocation(canonical)
    expect(body['name']).toBe('Main Warehouse')
    const addr = body['address'] as Record<string, unknown>
    expect(addr['address_1']).toBe('123 Commerce St')
    expect(addr['country_code']).toBe('SE')
  })
})
