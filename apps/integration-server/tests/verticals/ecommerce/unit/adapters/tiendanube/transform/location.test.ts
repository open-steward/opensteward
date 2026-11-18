import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawTiendanubeLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiendanube/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawTiendanubeLocation> = {}): RawTiendanubeLocation {
  return {
    id: 5,
    name: { en_US: 'Main Warehouse', es_AR: 'Depósito Principal' },
    is_default: true,
    address: {
      street: 'Av. Corrientes',
      number: '1234',
      city: 'Buenos Aires',
      province: { code: 'BA', name: 'Buenos Aires' },
      country: { code: 'AR', name: 'Argentina' },
      zipcode: 'C1043',
    },
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformLocation (Tiendanube)', () => {
  it('maps id and prefers en_US locale for name', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('5')
    expect(result.name).toBe('Main Warehouse')
  })

  it('falls back to es_AR locale when en_US missing', () => {
    const result = transformLocation(makeLocation({ name: { es_AR: 'Depósito Principal' } }))
    expect(result.name).toBe('Depósito Principal')
  })

  it('always sets active to true', () => {
    expect(transformLocation(makeLocation()).active).toBe(true)
  })

  it('always sets isFulfillmentCenter to true', () => {
    expect(transformLocation(makeLocation()).isFulfillmentCenter).toBe(true)
  })

  it('maps address with street+number concatenated', () => {
    const result = transformLocation(makeLocation())
    expect(result.address).toBeDefined()
    expect(result.address!.line1).toBe('Av. Corrientes 1234')
    expect(result.address!.city).toBe('Buenos Aires')
    expect(result.address!.country).toBe('AR')
    expect(result.address!.region).toBe('BA')
    expect(result.address!.postalCode).toBe('C1043')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying LocationSchema', () => {
    const result = transformLocation(makeLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
