import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSupyStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/supy/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

function makeRaw(overrides: Partial<RawSupyStockAdjustment> = {}): RawSupyStockAdjustment {
  return {
    id: 'adj-88',
    branchId: 'branch-3',
    type: 'stocktake',
    reason: 'monthly count',
    status: 'posted',
    lines: [
      {
        itemId: 'item-20',
        deltaQuantity: -5,
        countedQuantity: 95,
        notes: 'shelf count',
      },
    ],
    adjustedAt: '2024-03-01T00:00:00Z',
    adjustedBy: 'Manager',
    ...overrides,
  }
}

describe('transformStockAdjustment (supy)', () => {
  it('maps id and externalId', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.id).toBe('adj-88')
    expect(result.externalId).toBe('adj-88')
  })

  it('maps locationId from branchId', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.locationId).toBe('branch-3')
  })

  it('maps type "stocktake" → reason "cycle_count"', () => {
    const result = transformStockAdjustment(makeRaw({ type: 'stocktake' }))
    expect(result.reason).toBe('cycle_count')
  })

  it('maps type "wastage" with damage reason → "damage"', () => {
    const result = transformStockAdjustment(makeRaw({ type: 'wastage', reason: 'breakage' }))
    expect(result.reason).toBe('damage')
  })

  it('maps line items: productId, deltaQuantity, countedQuantity, notes', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-20')
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
    expect(result.lines[0]!.countedQuantity).toBe(95)
    expect(result.lines[0]!.notes).toBe('shelf count')
  })

  it('maps adjustedAt as ISO string', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.adjustedBy).toBe('Manager')
  })

  it('falls back to createdAt when adjustedAt is absent', () => {
    const result = transformStockAdjustment(
      makeRaw({ adjustedAt: undefined, createdAt: '2024-03-01T00:00:00Z' }),
    )
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is "supy"', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.platform).toBe('supy')
  })

  it('passes StockAdjustmentSchema validation', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
