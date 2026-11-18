import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type ShippifyWarehouse,
} from '../../../../../../../src/verticals/logistics/adapters/shippify/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeWarehouse(overrides: Partial<ShippifyWarehouse> = {}): ShippifyWarehouse {
  return {
    id: 'wh-001',
    name: 'Lima Main Hub',
    code: 'LIM-01',
    address: { street1: '789 Warehouse Blvd', city: 'Lima', country: 'PE' },
    is_active: true,
    timezone: 'America/Lima',
    cutoff_time: '16:00',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformWarehouse (shippify)', () => {
  it('maps id, name and code', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.id).toBe('wh-001')
    expect(result.name).toBe('Lima Main Hub')
    expect(result.code).toBe('LIM-01')
  })

  it('maps isActive from is_active', () => {
    expect(transformWarehouse(makeWarehouse({ is_active: true })).isActive).toBe(true)
    expect(transformWarehouse(makeWarehouse({ is_active: false })).isActive).toBe(false)
  })

  it('maps timezone and cutoffTime', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.timezone).toBe('America/Lima')
    expect(result.cutoffTime).toBe('16:00')
  })

  it('maps address city from nested address object', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.address?.city).toBe('Lima')
  })

  it('maps createdAt and updatedAt to Date', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes WarehouseSchema.parse without throwing', () => {
    expect(() => WarehouseSchema.parse(transformWarehouse(makeWarehouse()))).not.toThrow()
  })

  it('address is undefined when address field is null', () => {
    const result = transformWarehouse(makeWarehouse({ address: null }))
    expect(result.address).toBeUndefined()
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })

  it('sets metadata to raw input', () => {
    const raw = makeWarehouse()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })
})
