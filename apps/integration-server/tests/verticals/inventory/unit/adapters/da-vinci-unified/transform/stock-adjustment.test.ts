import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawDaVinciUnifiedStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/da-vinci-unified/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('da-vinci-unified transformStockAdjustment', () => {
  const raw: RawDaVinciUnifiedStockAdjustment = {
    adjustmentId: 'adj-001',
    warehouseId: 'wh-001',
    adjustmentReason: 'cycle count',
    status: 'POSTED',
    lines: [
      {
        itemId: 'item-001',
        quantityAdjusted: -5,
        quantityCounted: 95,
        notes: 'discrepancy found',
      },
    ],
    adjustmentDate: '2024-03-01T00:00:00Z',
    adjustedByUser: 'jane.doe',
  }

  it('maps id and externalId from adjustmentId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('adj-001')
    expect(result.externalId).toBe('adj-001')
  })

  it('maps locationId from warehouseId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('wh-001')
  })

  it('maps reason cycle_count for "cycle count"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason damage for "damage" keyword', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentReason: 'damaged goods' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason correction for "correction" keyword', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentReason: 'correction entry' })
    expect(result.reason).toBe('correction')
  })

  it('maps lines correctly', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('item-001')
    expect(result.lines[0].deltaQuantity).toBe(-5)
    expect(result.lines[0].countedQuantity).toBe(95)
    expect(result.lines[0].notes).toBe('discrepancy found')
  })

  it('maps adjustedAt from adjustmentDate', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to epoch when adjustmentDate is absent', () => {
    const result = transformStockAdjustment({ adjustmentId: 'adj-002' })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('maps adjustedBy from adjustedByUser', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('jane.doe')
  })

  it('sets platform to da-vinci-unified', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('da-vinci-unified')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
