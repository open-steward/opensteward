import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawMintsoftStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/mintsoft/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('mintsoft transformStockLevel', () => {
  const raw: RawMintsoftStockLevel = {
    ProductId: 123,
    WarehouseId: 7,
    ClientId: 10,
    SKU: 'SKU-ABC',
    Level: 50,
    LowStockLevel: 10,
    OnHand: 48,
    Allocated: 2,
    InTransit: 5,
    LastUpdated: '2024-03-01T00:00:00Z',
  }

  it('maps productId from ProductId as string', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('123')
  })

  it('maps locationId from WarehouseId as string', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('7')
  })

  it('constructs id from productId:locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('123:7')
  })

  it('maps quantityOnHand from Level field', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(50)
  })

  it('falls back to StockLevel field when Level is not present', () => {
    const raw2: RawMintsoftStockLevel = { ProductId: 1, WarehouseId: 1, StockLevel: 30 }
    const result = transformStockLevel(raw2)
    expect(result.quantityOnHand).toBe(30)
  })

  it('maps quantityAvailable from OnHand field', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(48)
  })

  it('maps quantityCommitted from Allocated field', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(2)
  })

  it('maps quantityIncoming from InTransit field', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(5)
  })

  it('maps reorderPoint from LowStockLevel', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(10)
  })

  it('sets platform to mintsoft', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('mintsoft')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
