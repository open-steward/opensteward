import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type RawPlentyOneWarehouse,
} from '../../../../../../../src/verticals/ecommerce/adapters/plentyone/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeWarehouse(overrides: Partial<RawPlentyOneWarehouse> = {}): RawPlentyOneWarehouse {
  return {
    id: 22,
    name: 'Hauptlager Berlin',
    typeId: 1, // own warehouse
    isActive: true,
    warehouseAddress: {
      address1: 'Industriestr. 10',
      address2: null,
      postalCode: '12345',
      town: 'Berlin',
      countryIsoCode2: 'DE',
    },
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('plentyone transformWarehouse', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.id).toBe('22')
    expect(result.name).toBe('Hauptlager Berlin')
    expect(result.active).toBe(true)
  })

  it('marks typeId 1 as fulfillment center', () => {
    const result = transformWarehouse(makeWarehouse({ typeId: 1 }))
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('marks typeId 3 as fulfillment center', () => {
    const result = transformWarehouse(makeWarehouse({ typeId: 3 }))
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('does not mark typeId 2 (repair) as fulfillment center', () => {
    const result = transformWarehouse(makeWarehouse({ typeId: 2 }))
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('maps warehouse address', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.address?.line1).toBe('Industriestr. 10')
    expect(result.address?.postalCode).toBe('12345')
    expect(result.address?.city).toBe('Berlin')
    expect(result.address?.country).toBe('DE')
  })

  it('returns active=true when isActive is not explicitly false', () => {
    const result = transformWarehouse(makeWarehouse({ isActive: undefined }))
    // active: raw.isActive !== false => true when undefined
    expect(result.active).toBe(true)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeWarehouse()
    const result = transformWarehouse(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
