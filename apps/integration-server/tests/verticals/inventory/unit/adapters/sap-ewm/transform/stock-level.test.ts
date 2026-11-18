import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSapEwmStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/sap-ewm/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('sap-ewm transformStockLevel', () => {
  const raw: RawSapEwmStockLevel = {
    EWMWarehouse: 'WH01',
    EWMStorageType: 'HIGH',
    EWMStorageBin: 'A-01-01',
    Product: 'MAT-001',
    Batch: 'BATCH-01',
    EWMStockQtyInBaseUnit: 100,
    EWMPickedQtyInBaseUnit: 10,
    EWMGoodsReceiptQtyInBaseUnit: 50,
    InventoryStockType: 'U',
    LastChangeDateTime: '2024-03-01T00:00:00Z',
  }

  it('synthesises id as EWMWarehouse:EWMStorageType:EWMStorageBin:Product:Batch', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('WH01:HIGH:A-01-01:MAT-001:BATCH-01')
  })

  it('maps productId from Product', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('MAT-001')
  })

  it('maps locationId as EWMWarehouse:EWMStorageType:EWMStorageBin when bin present', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('WH01:HIGH:A-01-01')
  })

  it('falls back locationId to EWMWarehouse when bin absent', () => {
    const result = transformStockLevel({ ...raw, EWMStorageBin: undefined })
    expect(result.locationId).toBe('WH01')
  })

  it('maps quantityOnHand from EWMStockQtyInBaseUnit', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('quantityAvailable equals EWMStockQtyInBaseUnit', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(100)
  })

  it('maps quantityCommitted from EWMPickedQtyInBaseUnit', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from EWMGoodsReceiptQtyInBaseUnit', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(50)
  })

  it('maps lastCountedAt from LastChangeDateTime', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is sap-ewm', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('sap-ewm')
  })

  it('produces output satisfying StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
