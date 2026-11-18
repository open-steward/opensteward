import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawKauflandWarehouse,
} from '../../../../../../../src/verticals/ecommerce/adapters/kaufland-marketplace/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeWarehouse(overrides: Partial<RawKauflandWarehouse> = {}): RawKauflandWarehouse {
  return {
    id_warehouse: 300,
    name: 'Main Warehouse',
    is_active: true,
    address: {
      street: 'Berliner Strasse',
      house_number: '5',
      postcode: '10115',
      city: 'Berlin',
      country: 'DE',
    },
    ...overrides,
  }
}

describe('transformLocation (kaufland-marketplace)', () => {
  it('maps id_warehouse to string id', () => {
    const result = transformLocation(makeWarehouse({ id_warehouse: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps name', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.name).toBe('Main Warehouse')
  })

  it('falls back to Warehouse {id} when name is null', () => {
    const result = transformLocation(makeWarehouse({ id_warehouse: 5, name: null }))
    expect(result.name).toBe('Warehouse 5')
  })

  it('maps is_active to active', () => {
    const result = transformLocation(makeWarehouse({ is_active: false }))
    expect(result.active).toBe(false)
  })

  it('hardcodes isFulfillmentCenter to true', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('concatenates street and house_number into address.line1', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.address?.line1).toBe('Berliner Strasse 5')
  })

  it('maps postcode to address.postalCode', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.address?.postalCode).toBe('10115')
  })

  it('maps city to address.city', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.address?.city).toBe('Berlin')
  })

  it('maps country to address.country', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.address?.country).toBe('DE')
  })

  it('sets address to undefined when address is null', () => {
    const result = transformLocation(makeWarehouse({ address: null }))
    expect(result.address).toBeUndefined()
  })

  it('stores raw payload in metadata', () => {
    const raw = makeWarehouse()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying LocationSchema', () => {
    const result = transformLocation(makeWarehouse())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
