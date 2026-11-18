import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawStoreFeederStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/store-feeder/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — store-feeder per-location shape', () => {
  const raw: RawStoreFeederStockLevel = {
    ProductID: 12345,
    SKU: 'WK-2026',
    StockLocationID: 201,
    StockLocationReference: 'BIN-A1',
    WarehouseID: 101,
    WarehouseName: 'Main WH',
    Inventory: 250,
    AvailableInventory: 240,
    Allocated: 10,
    OnPurchaseOrder: 100,
    ManualReorderLevel: 50,
    QuarantinedInventory: 5,
  }
  const result = transformStockLevel(raw)

  it('builds synthetic id as productId:locationId', () => {
    expect(result.id).toBe('12345:201')
  })

  it('maps productId from ProductID', () => {
    expect(result.productId).toBe('12345')
  })

  it('maps locationId from StockLocationID', () => {
    expect(result.locationId).toBe('201')
  })

  it('maps quantityOnHand from Inventory', () => {
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps quantityAvailable from AvailableInventory', () => {
    expect(result.quantityAvailable).toBe(240)
  })

  it('maps quantityCommitted from Allocated', () => {
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from OnPurchaseOrder', () => {
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps reorderPoint from ManualReorderLevel', () => {
    expect(result.reorderPoint).toBe(50)
  })

  it('stores quarantinedInventory in metadata', () => {
    expect(result.metadata['quarantinedInventory']).toBe('5')
  })

  it('stores stockLocationReference in metadata', () => {
    expect(result.metadata['stockLocationReference']).toBe('BIN-A1')
  })

  it('sets platform to store-feeder', () => {
    expect(result.platform).toBe('store-feeder')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — store-feeder StockLocationReference fallback', () => {
  const raw: RawStoreFeederStockLevel = {
    ProductID: 999,
    StockLocationReference: 'BIN-B2',
    Inventory: 0,
  }
  const result = transformStockLevel(raw)

  it('uses StockLocationReference as locationId when no StockLocationID', () => {
    expect(result.locationId).toBe('BIN-B2')
  })

  it('defaults quantityOnHand to 0 when Inventory is 0', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — store-feeder WarehouseID fallback', () => {
  const raw: RawStoreFeederStockLevel = {
    ProductGUID: 'prod-guid-xyz',
    WarehouseID: 101,
    Inventory: 50,
  }
  const result = transformStockLevel(raw)

  it('falls back productId to ProductGUID', () => {
    expect(result.productId).toBe('prod-guid-xyz')
  })

  it('falls back locationId to WarehouseID string', () => {
    expect(result.locationId).toBe('101')
  })
})
