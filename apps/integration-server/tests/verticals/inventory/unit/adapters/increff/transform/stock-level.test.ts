import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawIncreffStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/increff/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('increff transformStockLevel', () => {
  const raw: RawIncreffStockLevel = {
    skuCode: 'SKU-001',
    warehouseCode: 'WH-MUM-01',
    onHandQty: 100,
    availableQty: 90,
    allocatedQty: 10,
    inwardQty: 25,
    updatedOn: '2024-03-01T00:00:00Z',
  }

  it('maps id as skuCode:warehouseCode', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('SKU-001:WH-MUM-01')
  })

  it('maps productId from skuCode', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('SKU-001')
  })

  it('maps locationId from warehouseCode', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('WH-MUM-01')
  })

  it('maps quantityOnHand from onHandQty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('maps quantityAvailable, quantityCommitted, quantityIncoming', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(90)
    expect(result.quantityCommitted).toBe(10)
    expect(result.quantityIncoming).toBe(25)
  })

  it('maps lastCountedAt from updatedOn', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back locationId to locationCode when warehouseCode absent', () => {
    const result = transformStockLevel({ skuCode: 'SKU-002', locationCode: 'LOC-A' })
    expect(result.locationId).toBe('LOC-A')
    expect(result.id).toBe('SKU-002:LOC-A')
  })

  it('sets platform to increff', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('increff')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
