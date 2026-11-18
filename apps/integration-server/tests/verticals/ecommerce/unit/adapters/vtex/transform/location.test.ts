import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawVtexWarehouse,
} from '../../../../../../../src/verticals/ecommerce/adapters/vtex/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeWarehouse(overrides: Partial<RawVtexWarehouse> = {}): RawVtexWarehouse {
  return {
    id: 'WH-SP-01',
    name: 'São Paulo Warehouse',
    isActive: true,
    warehouseAddress: {
      street: 'Av. Paulista',
      number: '1000',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01310-100',
      country: {
        id: 'BRA',
        name: 'Brazil',
        acronym: 'BR',
      },
    },
    ...overrides,
  }
}

describe('transformLocation', () => {
  it('maps id and name', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.id).toBe('WH-SP-01')
    expect(result.name).toBe('São Paulo Warehouse')
  })

  it('always sets isFulfillmentCenter to true', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('maps active from isActive', () => {
    expect(transformLocation(makeWarehouse({ isActive: true })).active).toBe(true)
    expect(transformLocation(makeWarehouse({ isActive: false })).active).toBe(false)
  })

  it('defaults active to true when isActive is undefined', () => {
    const result = transformLocation(makeWarehouse({ isActive: undefined }))
    expect(result.active).toBe(true)
  })

  it('maps address with street + number joined by comma', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.address?.line1).toBe('Av. Paulista, 1000')
    expect(result.address?.city).toBe('São Paulo')
    expect(result.address?.region).toBe('SP')
    expect(result.address?.postalCode).toBe('01310-100')
  })

  it('uses country acronym first for country field', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.address?.country).toBe('BR')
  })

  it('falls back to country id when acronym is absent', () => {
    const result = transformLocation(
      makeWarehouse({
        warehouseAddress: {
          city: 'São Paulo',
          country: { id: 'BRA', name: 'Brazil', acronym: null },
        },
      }),
    )
    expect(result.address?.country).toBe('BRA')
  })

  it('omits address when warehouseAddress is absent', () => {
    const result = transformLocation(makeWarehouse({ warehouseAddress: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeWarehouse()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeWarehouse())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
