import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSkulabsInventoryHistoryRow,
} from '../../../../../../../src/verticals/inventory/adapters/skulabs/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('skulabs transformStockAdjustment', () => {
  const raw: RawSkulabsInventoryHistoryRow = {
    user_id: 'user-001',
    item_id: 'item-abc',
    location_id: 'loc-001',
    change: {
      type: 'increase',
      quantity: 15,
      notes: 'restock from supplier',
    },
    time: '2024-03-01T00:00:00Z',
    old_value: 85,
    sku: 'SKL-KB-01',
  }

  it('builds composite id as "<item_id>:<location_id>:<time>"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('item-abc:loc-001:2024-03-01T00:00:00Z')
    expect(result.externalId).toBe('item-abc:loc-001:2024-03-01T00:00:00Z')
  })

  it('maps location_id to locationId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('loc-001')
  })

  it('maps item_id to lines[0].productId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].productId).toBe('item-abc')
  })

  it('maps increase change type to positive deltaQuantity', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].deltaQuantity).toBe(15)
  })

  it('maps decrease change type to negative deltaQuantity', () => {
    const decrease: RawSkulabsInventoryHistoryRow = {
      ...raw,
      change: { type: 'decrease', quantity: 5, notes: 'damaged' },
    }
    const result = transformStockAdjustment(decrease)
    expect(result.lines[0].deltaQuantity).toBe(-5)
  })

  it('maps notes to lines[0].notes', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].notes).toBe('restock from supplier')
  })

  it('maps time to adjustedAt', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps user_id to adjustedBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('user-001')
  })

  it('maps notes containing "count" to "cycle_count" reason', () => {
    const count: RawSkulabsInventoryHistoryRow = {
      ...raw,
      change: { type: 'update', quantity: 0, notes: 'cycle count adjustment' },
    }
    expect(transformStockAdjustment(count).reason).toBe('cycle_count')
  })

  it('maps update type with no keyword notes to "correction" reason', () => {
    const correction: RawSkulabsInventoryHistoryRow = {
      ...raw,
      change: { type: 'update', quantity: 5, notes: '' },
    }
    expect(transformStockAdjustment(correction).reason).toBe('correction')
  })

  it('maps unknown to "other"', () => {
    const other: RawSkulabsInventoryHistoryRow = {
      ...raw,
      change: { type: 'increase', quantity: 5, notes: 'misc' },
    }
    expect(transformStockAdjustment(other).reason).toBe('other')
  })

  it('satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(raw))).not.toThrow()
  })
})
