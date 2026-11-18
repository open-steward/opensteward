import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawCamelot3plStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/camelot-3pl/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('camelot-3pl transformStockLevel', () => {
  const raw: RawCamelot3plStockLevel = {
    itemId: 'item-001',
    warehouseId: 'wh-001',
    warehouseCode: 'MW1',
    quantityOnHand: 100,
    quantityAvailable: 85,
    quantityAllocated: 15,
    quantityOnOrder: 50,
    reorderPoint: 20,
    reorderQuantity: 100,
    lastCountDate: '2024-03-01T00:00:00Z',
  }

  it('synthesises id from itemId:locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('item-001:wh-001')
  })

  it('maps productId from itemId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('item-001')
  })

  it('maps locationId from warehouseId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('wh-001')
  })

  it('falls back to warehouseCode when warehouseId absent', () => {
    const result = transformStockLevel({ ...raw, warehouseId: undefined })
    expect(result.locationId).toBe('MW1')
  })

  it('maps quantityOnHand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('maps quantityAvailable', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(85)
  })

  it('maps quantityCommitted from quantityAllocated', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(15)
  })

  it('maps quantityIncoming from quantityOnOrder', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(50)
  })

  it('maps reorderPoint', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(20)
  })

  it('maps reorderQuantity', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderQuantity).toBe(100)
  })

  it('maps lastCountedAt from lastCountDate', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to camelot-3pl', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('camelot-3pl')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
