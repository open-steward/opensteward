import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawMabangStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/mabang-erp/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('mabang-erp transformStockLevel', () => {
  const raw: RawMabangStockLevel = {
    stockId: '12345',
    stockSku: 'MB-SKU-001',
    stockName: 'Blue Widget',
    warehouseCode: 'WH-01',
    warehouseName: 'Main Warehouse',
    quantity: 100,
    usableQuantity: 90,
    lockQuantity: 10,
    purchaseQuantity: 50,
  }

  it('builds composite id from productId and locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('12345:WH-01')
  })

  it('maps productId from stockId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('12345')
  })

  it('maps locationId from warehouseCode', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('WH-01')
  })

  it('falls back locationId to warehouseName when warehouseCode absent', () => {
    const result = transformStockLevel({ ...raw, warehouseCode: undefined })
    expect(result.locationId).toBe('Main Warehouse')
  })

  it('maps quantityOnHand from quantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('maps quantityAvailable from usableQuantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(90)
  })

  it('maps quantityCommitted from lockQuantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from purchaseQuantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(50)
  })

  it('defaults quantityOnHand to 0 when quantity is absent', () => {
    const result = transformStockLevel({ ...raw, quantity: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets platform to mabang-erp', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('mabang-erp')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })
})
