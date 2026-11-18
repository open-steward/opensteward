import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawTruecommerceStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/truecommerce/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<RawTruecommerceStockLevel> = {}): RawTruecommerceStockLevel {
  return {
    item_id: 'item_001',
    location_id: 'loc_001',
    location_name: 'Main Warehouse',
    qty_on_hand: 250,
    qty_available: 240,
    qty_committed: 10,
    qty_on_order: 100,
    reorder_point: 50,
    reorder_qty: 200,
    last_count_date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── transformStockLevel ──────────────────────────────────────────────────────

describe('transformStockLevel', () => {
  it('constructs id as "<item_id>:<location_id>"', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.id).toBe('item_001:loc_001')
  })

  it('constructs id with empty string location when location_id is absent', () => {
    const result = transformStockLevel(makeRaw({ location_id: undefined }))
    expect(result.id).toBe('item_001:')
  })

  it('maps productId from item_id', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.productId).toBe('item_001')
  })

  it('maps locationId from location_id', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.locationId).toBe('loc_001')
  })

  it('maps quantityOnHand from qty_on_hand', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityOnHand).toBe(250)
  })

  it('defaults quantityOnHand to 0 when qty_on_hand is absent', () => {
    const result = transformStockLevel(makeRaw({ qty_on_hand: undefined }))
    expect(result.quantityOnHand).toBe(0)
  })

  it('maps quantityAvailable from qty_available', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityAvailable).toBe(240)
  })

  it('maps quantityCommitted from qty_committed', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from qty_on_order', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps reorderPoint from reorder_point', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.reorderPoint).toBe(50)
  })

  it('maps reorderQuantity from reorder_qty', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.reorderQuantity).toBe(200)
  })

  it('maps lastCountedAt from last_count_date as ISO string', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('puts locationName in metadata as a string', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.metadata['locationName']).toBe('Main Warehouse')
  })

  it('omits locationName from metadata when location_name is absent', () => {
    const result = transformStockLevel(makeRaw({ location_name: undefined }))
    expect(result.metadata['locationName']).toBeUndefined()
  })

  it('hardcodes platform to "truecommerce"', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.platform).toBe('truecommerce')
  })

  it('passes StockLevelSchema.parse without throwing', () => {
    const result = transformStockLevel(makeRaw())
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
