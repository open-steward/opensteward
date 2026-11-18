import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type DaVinciWarehouse,
} from '../../../../../../../src/verticals/logistics/adapters/da-vinci-unified/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeWarehouse(o: Partial<DaVinciWarehouse> = {}): DaVinciWarehouse {
  return {
    WarehouseId: 10,
    WarehouseCode: 'DAL1',
    WarehouseName: 'Dallas Warehouse',
    IsActive: true,
    Timezone: 'America/Chicago',
    CutoffTime: '17:00',
    Address: {
      address1: '100 Industrial Blvd',
      city: 'Dallas',
      state: 'TX',
      postalCode: '75201',
      country: 'US',
    },
    CreatedDate: '2024-03-01T00:00:00Z',
    ModifiedDate: '2024-03-01T00:00:00Z',
    ...o,
  }
}

describe('da-vinci-unified transformWarehouse', () => {
  it('maps WarehouseId to string id', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.id).toBe('10')
  })

  it('sets id to undefined when WarehouseId is null', () => {
    const result = transformWarehouse(makeWarehouse({ WarehouseId: null }))
    expect(result.id).toBeUndefined()
  })

  it('maps WarehouseName to name', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.name).toBe('Dallas Warehouse')
  })

  it('maps WarehouseCode to code', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.code).toBe('DAL1')
  })

  it('maps IsActive', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.isActive).toBe(true)
  })

  it('maps Timezone', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.timezone).toBe('America/Chicago')
  })

  it('maps CutoffTime', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.cutoffTime).toBe('17:00')
  })

  it('maps Address city', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.address?.city).toBe('Dallas')
  })

  it('maps CreatedDate to createdAt', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps ModifiedDate to updatedAt', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes WarehouseSchema validation', () => {
    const result = transformWarehouse(makeWarehouse())
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })

  it('passes WarehouseSchema validation with minimal input', () => {
    const result = transformWarehouse({})
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })
})
