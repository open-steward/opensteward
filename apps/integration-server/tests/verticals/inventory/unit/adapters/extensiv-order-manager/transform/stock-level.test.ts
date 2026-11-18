import { describe, it, expect } from 'vitest'
import {
  transformProductStockTotal,
  transformInventoryRecord,
  type RawExtensivProductStockTotal,
  type RawExtensivInventoryRecord,
} from '../../../../../../../src/verticals/inventory/adapters/extensiv-order-manager/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('extensiv-order-manager transformProductStockTotal', () => {
  const raw: RawExtensivProductStockTotal = {
    productId: 101,
    masterSku: 'WK-2026',
    name: 'Wireless Keyboard',
    onHandQuantity: 100,
    availableQuantity: 85,
    inTransitQuantity: 20,
    lockedQuantity: 15,
  }

  it('maps id as extensiv:total:{productId}', () => {
    const result = transformProductStockTotal(raw)
    expect(result.id).toBe('extensiv:total:101')
  })

  it('maps productId from productId field', () => {
    const result = transformProductStockTotal(raw)
    expect(result.productId).toBe('101')
  })

  it('sets locationId to empty string for aggregate records', () => {
    const result = transformProductStockTotal(raw)
    expect(result.locationId).toBe('')
  })

  it('maps quantityOnHand from onHandQuantity', () => {
    const result = transformProductStockTotal(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('maps quantityAvailable from availableQuantity', () => {
    const result = transformProductStockTotal(raw)
    expect(result.quantityAvailable).toBe(85)
  })

  it('maps quantityCommitted from lockedQuantity', () => {
    const result = transformProductStockTotal(raw)
    expect(result.quantityCommitted).toBe(15)
  })

  it('maps quantityIncoming from inTransitQuantity', () => {
    const result = transformProductStockTotal(raw)
    expect(result.quantityIncoming).toBe(20)
  })

  it('sets platform to extensiv-order-manager', () => {
    const result = transformProductStockTotal(raw)
    expect(result.platform).toBe('extensiv-order-manager')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformProductStockTotal(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('extensiv-order-manager transformInventoryRecord', () => {
  const raw: RawExtensivInventoryRecord = {
    productStockId: 9001,
    quantity: 50,
    allocatedQuantity: 5,
    availableQuantity: 45,
    product: {
      productId: 101,
      masterSku: 'WK-2026',
    },
    stockLocation: {
      stockLocationId: 201,
      warehouseId: 301,
      location: 'A-01-B',
    },
    warehouseStockTotals: {
      onHandQuantity: 50,
      availableQuantity: 45,
      inTransitQuantity: 10,
      allocatedQuantity: 5,
      lockedQuantity: 0,
    },
  }

  it('maps id as extensiv:inv:{productStockId}', () => {
    const result = transformInventoryRecord(raw)
    expect(result.id).toBe('extensiv:inv:9001')
  })

  it('maps productId from nested product.productId', () => {
    const result = transformInventoryRecord(raw)
    expect(result.productId).toBe('101')
  })

  it('maps locationId from stockLocation.stockLocationId', () => {
    const result = transformInventoryRecord(raw)
    expect(result.locationId).toBe('201')
  })

  it('maps quantityOnHand from warehouseStockTotals.onHandQuantity', () => {
    const result = transformInventoryRecord(raw)
    expect(result.quantityOnHand).toBe(50)
  })

  it('maps quantityAvailable from warehouseStockTotals', () => {
    const result = transformInventoryRecord(raw)
    expect(result.quantityAvailable).toBe(45)
  })

  it('sets platform to extensiv-order-manager', () => {
    const result = transformInventoryRecord(raw)
    expect(result.platform).toBe('extensiv-order-manager')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformInventoryRecord(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
