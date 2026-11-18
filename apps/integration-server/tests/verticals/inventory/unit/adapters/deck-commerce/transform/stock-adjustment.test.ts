import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawDeckCommerceStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/deck-commerce/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('deck-commerce transformStockAdjustment', () => {
  const raw: RawDeckCommerceStockAdjustment = {
    AdjustmentID: 'dc-adj-001',
    WarehouseCode: 'WH1',
    AdjustmentReason: 'inventory count',
    Status: 'Posted',
    Lines: [
      {
        SKU: 'DC-SKU-001',
        DeltaQty: -2,
        CountedQty: 48,
        Notes: 'Short count during audit',
      },
    ],
    AdjustmentDateUTC: '2024-03-01T00:00:00Z',
    AdjustedBy: 'bob',
  }

  it('maps id and externalId from AdjustmentID', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('dc-adj-001')
    expect(result.externalId).toBe('dc-adj-001')
  })

  it('maps locationId from WarehouseCode', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('WH1')
  })

  it('maps reason "inventory count" to cycle_count', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason "damage" to damage', () => {
    const result = transformStockAdjustment({ ...raw, AdjustmentReason: 'damage write-off' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason "correction" to correction', () => {
    const result = transformStockAdjustment({ ...raw, AdjustmentReason: 'data correction' })
    expect(result.reason).toBe('correction')
  })

  it('maps lines correctly', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('DC-SKU-001')
    expect(result.lines[0].deltaQuantity).toBe(-2)
    expect(result.lines[0].countedQuantity).toBe(48)
    expect(result.lines[0].notes).toBe('Short count during audit')
  })

  it('maps adjustedAt from AdjustmentDateUTC', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to epoch when AdjustmentDateUTC absent', () => {
    const result = transformStockAdjustment({ AdjustmentID: 'dc-adj-002' })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('maps adjustedBy from AdjustedBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('bob')
  })

  it('sets platform to deck-commerce', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('deck-commerce')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
