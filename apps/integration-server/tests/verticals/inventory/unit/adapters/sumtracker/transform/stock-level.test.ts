import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSumtrackerStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/sumtracker/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

function makeRaw(overrides: Partial<RawSumtrackerStockLevel> = {}): RawSumtrackerStockLevel {
  return {
    product_id: 'prod-7',
    warehouse_id: 3,
    warehouse_name: 'Main Warehouse',
    physical_stock: 100,
    booked_stock: 10,
    available_stock: 90,
    incoming_stock: 20,
    reorder_point: 25,
    reorder_qty: 50,
    last_count_date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformStockLevel (sumtracker)', () => {
  it('synthesizes id as <productId>:<locationId>', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.id).toBe('prod-7:3')
    expect(result.productId).toBe('prod-7')
    expect(result.locationId).toBe('3')
  })

  it('maps quantityOnHand from physical_stock', () => {
    const result = transformStockLevel(makeRaw({ physical_stock: 100 }))
    expect(result.quantityOnHand).toBe(100)
  })

  it('maps quantityAvailable and quantityCommitted', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityAvailable).toBe(90)
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from incoming_stock', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityIncoming).toBe(20)
  })

  it('maps reorderPoint and reorderQuantity', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.reorderPoint).toBe(25)
    expect(result.reorderQuantity).toBe(50)
  })

  it('maps lastCountedAt as ISO string', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to warehouse_name when warehouse_id is missing', () => {
    const result = transformStockLevel(
      makeRaw({ warehouse_id: undefined, warehouse_name: 'BackRoom' }),
    )
    expect(result.locationId).toBe('BackRoom')
    expect(result.id).toBe('prod-7:BackRoom')
  })

  it('defaults quantityOnHand to 0 when physical_stock is absent', () => {
    const result = transformStockLevel(makeRaw({ physical_stock: undefined }))
    expect(result.quantityOnHand).toBe(0)
  })

  it('platform is "sumtracker"', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.platform).toBe('sumtracker')
  })

  it('passes StockLevelSchema validation', () => {
    const result = transformStockLevel(makeRaw())
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
