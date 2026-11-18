import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawTecsysStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/tecsys/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

function makeRaw(overrides: Partial<RawTecsysStockAdjustment> = {}): RawTecsysStockAdjustment {
  return {
    AdjustmentId: 'ADJ-333',
    LocationInternalName: 'LOC-MAIN',
    AdjustmentReason: 'Cycle Count',
    Status: 'Posted',
    AdjustedDate: '2024-03-01T00:00:00Z',
    AdjustedBy: 'warehouse.staff',
    Lines: [
      {
        Sku: 'SKU-TECSYS-001',
        QuantityDelta: -8,
        CountedQuantity: 192,
        Notes: 'shelf A-3',
      },
    ],
    ...overrides,
  }
}

describe('transformStockAdjustment (tecsys)', () => {
  it('maps id and externalId from AdjustmentId', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.id).toBe('ADJ-333')
    expect(result.externalId).toBe('ADJ-333')
  })

  it('maps locationId from LocationInternalName', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.locationId).toBe('LOC-MAIN')
  })

  it('maps AdjustmentReason "Cycle Count" → reason "cycle_count"', () => {
    const result = transformStockAdjustment(makeRaw({ AdjustmentReason: 'Cycle Count' }))
    expect(result.reason).toBe('cycle_count')
  })

  it('maps AdjustmentReason "Damaged Goods" → reason "damage"', () => {
    const result = transformStockAdjustment(makeRaw({ AdjustmentReason: 'Damaged Goods' }))
    expect(result.reason).toBe('damage')
  })

  it('maps AdjustmentReason "Theft" → reason "theft"', () => {
    const result = transformStockAdjustment(makeRaw({ AdjustmentReason: 'Theft' }))
    expect(result.reason).toBe('theft')
  })

  it('maps AdjustmentReason "Expired" → reason "expiration"', () => {
    const result = transformStockAdjustment(makeRaw({ AdjustmentReason: 'Expired' }))
    expect(result.reason).toBe('expiration')
  })

  it('maps line items: productId, deltaQuantity, countedQuantity, notes', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('SKU-TECSYS-001')
    expect(result.lines[0]!.deltaQuantity).toBe(-8)
    expect(result.lines[0]!.countedQuantity).toBe(192)
    expect(result.lines[0]!.notes).toBe('shelf A-3')
  })

  it('maps adjustedAt from AdjustedDate as ISO string', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from AdjustedBy', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.adjustedBy).toBe('warehouse.staff')
  })

  it('platform is "tecsys"', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.platform).toBe('tecsys')
  })

  it('handles missing Lines', () => {
    const result = transformStockAdjustment(makeRaw({ Lines: undefined }))
    expect(result.lines).toEqual([])
  })

  it('passes StockAdjustmentSchema validation', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
