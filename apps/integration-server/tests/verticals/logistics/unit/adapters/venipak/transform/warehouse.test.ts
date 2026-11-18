import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type VenipakPickupPoint,
} from '../../../../../../../src/verticals/logistics/adapters/venipak/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makePickupPoint(overrides: Partial<VenipakPickupPoint> = {}): VenipakPickupPoint {
  return {
    id: 'PP-VLN-001',
    name: 'Vilnius Pickup',
    code: 'VLN001',
    display_name: 'Vilnius Pickup Point',
    address: 'Gedimino pr. 1',
    city: 'Vilnius',
    zip: 'LT-01001',
    country: 'LT',
    contact_t: '+37061000000',
    pick_up_enabled: true,
    type: 1,
    ...overrides,
  }
}

describe('transformWarehouse (venipak)', () => {
  it('maps id to string', () => {
    const result = transformWarehouse(makePickupPoint())
    expect(result.id).toBe('PP-VLN-001')
  })

  it('maps name from display_name when present', () => {
    const result = transformWarehouse(makePickupPoint())
    expect(result.name).toBe('Vilnius Pickup Point')
  })

  it('falls back name to name field when display_name is absent', () => {
    const result = transformWarehouse(makePickupPoint({ display_name: null }))
    expect(result.name).toBe('Vilnius Pickup')
  })

  it('maps code from code field', () => {
    const result = transformWarehouse(makePickupPoint())
    expect(result.code).toBe('VLN001')
  })

  it('maps address fields: street1, city, postalCode, country', () => {
    const result = transformWarehouse(makePickupPoint())
    expect(result.address?.street1).toBe('Gedimino pr. 1')
    expect(result.address?.city).toBe('Vilnius')
    expect(result.address?.postalCode).toBe('LT-01001')
    expect(result.address?.country).toBe('LT')
  })

  it('maps phone from contact_t', () => {
    const result = transformWarehouse(makePickupPoint())
    expect(result.address?.phone).toBe('+37061000000')
  })

  it('maps isActive from pick_up_enabled', () => {
    const result = transformWarehouse(makePickupPoint({ pick_up_enabled: false }))
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when pick_up_enabled is null', () => {
    const result = transformWarehouse(makePickupPoint({ pick_up_enabled: null }))
    expect(result.isActive).toBe(true)
  })

  it('passes metadata through as raw object', () => {
    const raw = makePickupPoint()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('returns undefined address when all address fields are absent', () => {
    const result = transformWarehouse(
      makePickupPoint({ address: null, city: null, zip: null, country: null }),
    )
    expect(result.address).toBeUndefined()
  })

  it('passes WarehouseSchema.parse without throwing', () => {
    const result = transformWarehouse(makePickupPoint())
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })
})
