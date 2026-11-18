import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSumtrackerStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/sumtracker/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

function makeRaw(
  overrides: Partial<RawSumtrackerStockAdjustment> = {},
): RawSumtrackerStockAdjustment {
  return {
    id: 301,
    warehouse_id: 5,
    reason: 'cycle count',
    status: 'completed',
    items: [
      {
        product_id: 'prod-9',
        adjusted_qty: -3,
        counted_qty: 47,
        notes: 'counted at close',
      },
    ],
    adjustment_date: '2024-03-01T00:00:00Z',
    adjusted_by: 'Jane',
    ...overrides,
  }
}

describe('transformStockAdjustment (sumtracker)', () => {
  it('maps id and externalId from numeric raw.id', () => {
    const result = transformStockAdjustment(makeRaw({ id: 301 }))
    expect(result.id).toBe('301')
    expect(result.externalId).toBe('301')
  })

  it('maps locationId from warehouse_id', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.locationId).toBe('5')
  })

  it('maps reason "cycle count" → "cycle_count"', () => {
    const result = transformStockAdjustment(makeRaw({ reason: 'cycle count' }))
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason "damage" → "damage"', () => {
    const result = transformStockAdjustment(makeRaw({ reason: 'damage' }))
    expect(result.reason).toBe('damage')
  })

  it('maps line items: productId, deltaQuantity, countedQuantity, notes', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-9')
    expect(result.lines[0]!.deltaQuantity).toBe(-3)
    expect(result.lines[0]!.countedQuantity).toBe(47)
    expect(result.lines[0]!.notes).toBe('counted at close')
  })

  it('maps adjustedAt as ISO string', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.adjustedBy).toBe('Jane')
  })

  it('platform is "sumtracker"', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.platform).toBe('sumtracker')
  })

  it('handles missing items array', () => {
    const result = transformStockAdjustment(makeRaw({ items: undefined }))
    expect(result.lines).toEqual([])
  })

  it('passes StockAdjustmentSchema validation', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
