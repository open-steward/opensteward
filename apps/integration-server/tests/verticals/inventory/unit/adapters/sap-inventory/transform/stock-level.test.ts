import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSapStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/sap-inventory/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('sap-inventory transformStockLevel', () => {
  const raw: RawSapStockLevel = {
    Material: 'MAT-001',
    Plant: '1000',
    StorageLocation: '0001',
    MatlWrhsStkQtyInMatlBaseUnit: 250,
    MaterialBaseUnit: 'EA',
    InventoryStockType: '01',
  }

  it('synthesises id as Material:locationId:InventoryStockType', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('MAT-001:1000:0001:01')
  })

  it('maps productId from Material', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('MAT-001')
  })

  it('maps locationId as Plant:StorageLocation', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('1000:0001')
  })

  it('locationId is just Plant when StorageLocation absent', () => {
    const result = transformStockLevel({ ...raw, StorageLocation: undefined })
    expect(result.locationId).toBe('1000')
  })

  it('maps quantityOnHand from MatlWrhsStkQtyInMatlBaseUnit', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(250)
  })

  it('quantityAvailable is undefined (not exposed by this adapter)', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBeUndefined()
  })

  it('quantityCommitted is undefined', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBeUndefined()
  })

  it('lastCountedAt is undefined (not exposed by this adapter)', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBeUndefined()
  })

  it('platform is sap-inventory', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('sap-inventory')
  })

  it('produces output satisfying StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
