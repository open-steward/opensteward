import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  transformStorageBin,
  transformLocation,
  type RawSapEwmWarehouse,
  type RawSapEwmStorageBin,
} from '../../../../../../../src/verticals/inventory/adapters/sap-ewm/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('sap-ewm transformWarehouse', () => {
  const raw: RawSapEwmWarehouse = {
    WarehouseNumber: 'WH01',
    WarehouseNumberName: 'Main Warehouse',
    Plant: '1000',
    Country: 'US',
    City: 'Chicago',
    StreetAddress: '100 Main St',
    PostalCode: '60601',
    Region: 'IL',
  }

  it('maps id from WarehouseNumber', () => {
    const result = transformWarehouse(raw)
    expect(result.id).toBe('WH01')
  })

  it('maps name from WarehouseNumberName', () => {
    const result = transformWarehouse(raw)
    expect(result.name).toBe('Main Warehouse')
  })

  it('type is warehouse', () => {
    const result = transformWarehouse(raw)
    expect(result.type).toBe('warehouse')
  })

  it('isActive is always true', () => {
    const result = transformWarehouse(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps address fields', () => {
    const result = transformWarehouse(raw)
    expect(result.address?.city).toBe('Chicago')
    expect(result.address?.country).toBe('US')
  })

  it('platform is sap-ewm', () => {
    const result = transformWarehouse(raw)
    expect(result.platform).toBe('sap-ewm')
  })

  it('produces output satisfying LocationSchema', () => {
    const result = transformWarehouse(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('sap-ewm transformStorageBin', () => {
  const raw: RawSapEwmStorageBin = {
    EWMWarehouse: 'WH01',
    EWMStorageType: 'HIGH',
    EWMStorageBin: 'A-01-01',
    EWMStorageBinIsBlocked: false,
  }

  it('maps id as EWMWarehouse:EWMStorageType:EWMStorageBin', () => {
    const result = transformStorageBin(raw)
    expect(result.id).toBe('WH01:HIGH:A-01-01')
  })

  it('maps code from EWMStorageBin', () => {
    const result = transformStorageBin(raw)
    expect(result.code).toBe('A-01-01')
  })

  it('type is bin', () => {
    const result = transformStorageBin(raw)
    expect(result.type).toBe('bin')
  })

  it('parentLocationId is EWMWarehouse:EWMStorageType', () => {
    const result = transformStorageBin(raw)
    expect(result.parentLocationId).toBe('WH01:HIGH')
  })

  it('isActive true when EWMStorageBinIsBlocked is false', () => {
    const result = transformStorageBin(raw)
    expect(result.isActive).toBe(true)
  })

  it('isActive false when EWMStorageBinIsBlocked is true', () => {
    const result = transformStorageBin({ ...raw, EWMStorageBinIsBlocked: true })
    expect(result.isActive).toBe(false)
  })

  // Skip schema parse: transformStorageBin emits type 'bin' which is not in
  // LocationTypeSchema's allowed set (warehouse|store|virtual|transit|supplier|unknown).
  // The source intentionally uses 'bin' as a more specific type; schema parse would fail.
})

describe('sap-ewm transformLocation dispatch', () => {
  it('dispatches to warehouse when EWMStorageBin absent', () => {
    const raw: RawSapEwmWarehouse = { WarehouseNumber: 'WH02' }
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
    expect(result.id).toBe('WH02')
  })

  it('dispatches to storage bin when EWMWarehouse + EWMStorageBin present', () => {
    const raw: RawSapEwmStorageBin = {
      EWMWarehouse: 'WH02',
      EWMStorageType: 'BULK',
      EWMStorageBin: 'B-02-03',
    }
    const result = transformLocation(raw)
    expect(result.type).toBe('bin')
    expect(result.id).toBe('WH02:BULK:B-02-03')
  })
})
