import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  syntheticDefaultLocation,
  type RawInsalesWarehouse,
} from '../../../../../../../src/verticals/ecommerce/adapters/insales/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeWarehouse(overrides: Partial<RawInsalesWarehouse> = {}): RawInsalesWarehouse {
  return {
    id: 10,
    title: 'Главный склад',
    address: 'ул. Складская 1',
    city: 'Москва',
    phone: '+74957654321',
    active: true,
    ...overrides,
  }
}

describe('transformWarehouse (insales)', () => {
  it('maps id as string and name from title', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.id).toBe('10')
    expect(result.name).toBe('Главный склад')
  })

  it('falls back to Warehouse <id> when title is null', () => {
    const result = transformWarehouse(makeWarehouse({ title: null }))
    expect(result.name).toBe('Warehouse 10')
  })

  it('maps active', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.active).toBe(true)
  })

  it('maps address fields', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.address?.line1).toBe('ул. Складская 1')
    expect(result.address?.city).toBe('Москва')
  })

  it('maps phone', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.phone).toBe('+74957654321')
  })

  it('sets isFulfillmentCenter true when active', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('omits isFulfillmentCenter when active is false', () => {
    const result = transformWarehouse(makeWarehouse({ active: false }))
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('returns no address when address and city are null', () => {
    const result = transformWarehouse(makeWarehouse({ address: null, city: null }))
    expect(result.address).toBeUndefined()
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeWarehouse()
    const result = transformWarehouse(raw)
    expect(result.metadata).toBe(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('syntheticDefaultLocation (insales)', () => {
  it('returns a valid default location', () => {
    const result = syntheticDefaultLocation()
    expect(result.id).toBe('default')
    expect(result.name).toBe('Default Warehouse')
    expect(result.active).toBe(true)
    expect(result.isFulfillmentCenter).toBe(true)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
