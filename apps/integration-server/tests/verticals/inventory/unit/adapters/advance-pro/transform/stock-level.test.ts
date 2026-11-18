import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawAdvanceProStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/advance-pro/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

const rawStockLevel: RawAdvanceProStockLevel = {
  productId: '42',
  warehouseId: '5',
  quantityOnHand: 100,
  quantityAvailable: 90,
  quantityCommitted: 10,
  quantityOnOrder: 50,
  reorderPoint: 20,
  reorderQuantity: 100,
  lastCountDate: '2024-03-01T00:00:00Z',
}

describe('transformStockLevel', () => {
  it('builds composite id from productId and warehouseId', () => {
    const result = transformStockLevel(rawStockLevel)
    expect(result.id).toBe('42:5')
  })

  it('maps productId and locationId', () => {
    const result = transformStockLevel(rawStockLevel)
    expect(result.productId).toBe('42')
    expect(result.locationId).toBe('5')
  })

  it('maps quantity fields', () => {
    const result = transformStockLevel(rawStockLevel)
    expect(result.quantityOnHand).toBe(100)
    expect(result.quantityAvailable).toBe(90)
    expect(result.quantityCommitted).toBe(10)
    expect(result.quantityIncoming).toBe(50)
  })

  it('maps platform', () => {
    const result = transformStockLevel(rawStockLevel)
    expect(result.platform).toBe('advance-pro')
  })

  it('passes StockLevelSchema validation', () => {
    const result = transformStockLevel(rawStockLevel)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
