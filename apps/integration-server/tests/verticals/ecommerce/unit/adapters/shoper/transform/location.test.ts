import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawShoperWarehouse,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoper/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeRaw(overrides: Partial<RawShoperWarehouse> = {}): RawShoperWarehouse {
  return {
    warehouse_id: 901,
    name: 'Magazyn Główny',
    active: 1,
    street: 'ul. Przemysłowa 5',
    apartment: null,
    city: 'Łódź',
    state: 'łódzkie',
    postcode: '91-001',
    country_code: 'PL',
    phone: '+48426001234',
    ...overrides,
  }
}

describe('shoper transformLocation', () => {
  it('maps warehouse_id to string id', () => {
    const result = transformLocation(makeRaw())
    expect(result.id).toBe('901')
  })

  it('maps name', () => {
    const result = transformLocation(makeRaw())
    expect(result.name).toBe('Magazyn Główny')
  })

  it('converts active numeric 1 to boolean true', () => {
    const result = transformLocation(makeRaw())
    expect(result.active).toBe(true)
  })

  it('isFulfillmentCenter is always true for Shoper warehouses', () => {
    const result = transformLocation(makeRaw())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('maps address using country_code and street → line1', () => {
    const result = transformLocation(makeRaw())
    expect(result.address?.line1).toBe('ul. Przemysłowa 5')
    expect(result.address?.city).toBe('Łódź')
    expect(result.address?.postalCode).toBe('91-001')
    expect(result.address?.country).toBe('PL')
    expect(result.address?.region).toBe('łódzkie')
  })

  it('produces output that passes LocationSchema', () => {
    const result = transformLocation(makeRaw())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
