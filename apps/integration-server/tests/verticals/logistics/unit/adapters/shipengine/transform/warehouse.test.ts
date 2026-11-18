import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type ShipEngineWarehouse,
} from '../../../../../../../src/verticals/logistics/adapters/shipengine/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeWarehouse(overrides: Partial<ShipEngineWarehouse> = {}): ShipEngineWarehouse {
  return {
    warehouse_id: 'se-wh-001',
    name: 'SF Distribution Center',
    origin_address: {
      name: 'Acme Logistics',
      address_line1: '1 Market St',
      city_locality: 'San Francisco',
      state_province: 'CA',
      postal_code: '94105',
      country_code: 'US',
    },
    return_address: {
      name: 'Acme Returns',
      address_line1: '2 Market St',
      city_locality: 'San Francisco',
      state_province: 'CA',
      postal_code: '94105',
      country_code: 'US',
    },
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformWarehouse (shipengine)', () => {
  it('maps id from warehouse_id', () => {
    expect(transformWarehouse(makeWarehouse()).id).toBe('se-wh-001')
  })

  it('maps name from name field', () => {
    expect(transformWarehouse(makeWarehouse()).name).toBe('SF Distribution Center')
  })

  it('maps address from origin_address', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.address?.name).toBe('Acme Logistics')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.country).toBe('US')
  })

  it('isActive is always true', () => {
    expect(transformWarehouse(makeWarehouse()).isActive).toBe(true)
  })

  it('maps createdAt as Date from created_at', () => {
    expect(transformWarehouse(makeWarehouse()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeWarehouse()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('omits address when origin_address is null', () => {
    const result = transformWarehouse(makeWarehouse({ origin_address: null }))
    expect(result.address).toBeUndefined()
  })

  it('handles null name gracefully', () => {
    const result = transformWarehouse(makeWarehouse({ name: null }))
    expect(result.name).toBeUndefined()
  })

  it('passes WarehouseSchema.parse without throwing', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })
})
