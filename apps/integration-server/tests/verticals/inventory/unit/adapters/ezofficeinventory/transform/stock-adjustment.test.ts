import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawEZOStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/ezofficeinventory/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — ezofficeinventory add stock', () => {
  const raw: RawEZOStockAdjustment = {
    inventory_id: 10,
    id: 500,
    order_type: 'Add Stock',
    quantity: 20,
    location_id: 3,
    location_name: 'Shelf A',
    created_at: '2024-03-01T00:00:00Z',
    user_full_name: 'Alice',
    comments: 'Restocking',
  }
  const result = transformStockAdjustment(raw)

  it('builds composite id from inventory_id and event id', () => {
    expect(result.id).toBe('10:500')
  })

  it('maps locationId from location_id as string', () => {
    expect(result.locationId).toBe('3')
  })

  it('maps reason "Add Stock" to "other"', () => {
    expect(result.reason).toBe('other')
  })

  it('produces positive deltaQuantity for add stock', () => {
    expect(result.lines[0]?.deltaQuantity).toBe(20)
  })

  it('maps productId in line from inventory_id', () => {
    expect(result.lines[0]?.productId).toBe('10')
  })

  it('maps notes from comments', () => {
    expect(result.lines[0]?.notes).toBe('Restocking')
  })

  it('maps adjustedBy from user_full_name', () => {
    expect(result.adjustedBy).toBe('Alice')
  })

  it('maps adjustedAt from created_at', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to ezofficeinventory', () => {
    expect(result.platform).toBe('ezofficeinventory')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — ezofficeinventory remove stock', () => {
  const raw: RawEZOStockAdjustment = {
    inventory_id: 10,
    id: 501,
    order_type: 'Remove Stock',
    quantity: 5,
    location_id: 3,
  }
  const result = transformStockAdjustment(raw)

  it('produces negative deltaQuantity for remove stock', () => {
    expect(result.lines[0]?.deltaQuantity).toBe(-5)
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — ezofficeinventory reason mapping', () => {
  const base: RawEZOStockAdjustment = { inventory_id: 1, id: 1, quantity: 1, location_id: 1 }

  it.each([
    ['Inventory Audit', 'cycle_count'],
    ['Stock Count', 'cycle_count'],
    ['Damage Loss', 'damage'],
    ['Theft Report', 'theft'],
    ['Lost Item', 'lost'],
    ['Found Stock', 'found'],
    ['Expiration Removal', 'expiration'],
    ['Stock Correction', 'correction'],
    ['Misc Adjustment', 'other'],
  ] as const)('maps order_type "%s" to reason "%s"', (order_type, expected) => {
    const result = transformStockAdjustment({ ...base, order_type })
    expect(result.reason).toBe(expected)
  })
})

describe('transformStockAdjustment — ezofficeinventory missing created_at', () => {
  const raw: RawEZOStockAdjustment = { inventory_id: 5, id: 10, location_id: 1 }
  const result = transformStockAdjustment(raw)

  it('falls back adjustedAt to epoch when created_at absent', () => {
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
