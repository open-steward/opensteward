import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawManhattanActiveInventory,
} from '../../../../../../../src/verticals/inventory/adapters/manhattan-active/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('manhattan-active transformStockLevel', () => {
  const raw: RawManhattanActiveInventory = {
    itemId: 'ITEM-001',
    locationId: 'LOC-001',
    locationName: 'Bin A-12',
    quantityOnHand: 50,
    quantityAvailable: 45,
    quantityCommitted: 5,
    quantityIncoming: 20,
    reorderPoint: 10,
    reorderQuantity: 30,
    lastCountDateTime: '2024-03-01T00:00:00Z',
  }

  it('builds composite id from itemId and locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('ITEM-001:LOC-001')
  })

  it('maps productId from itemId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('ITEM-001')
  })

  it('maps locationId from locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('LOC-001')
  })

  it('maps quantityOnHand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(50)
  })

  it('maps quantityAvailable', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(45)
  })

  it('maps quantityCommitted', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(5)
  })

  it('maps quantityIncoming', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(20)
  })

  it('maps reorderPoint', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(10)
  })

  it('maps reorderQuantity', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderQuantity).toBe(30)
  })

  it('maps lastCountedAt from lastCountDateTime', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults quantityOnHand to 0 when absent', () => {
    const result = transformStockLevel({ ...raw, quantityOnHand: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets platform to manhattan-active', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('manhattan-active')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })
})
