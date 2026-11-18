import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSkusavvyStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/skusavvy/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('skusavvy transformStockAdjustment', () => {
  const raw: RawSkusavvyStockAdjustment = {
    id: 'adj-01',
    locationId: 'loc-01',
    reason: 'stocktake',
    lineItems: [
      {
        productId: 'prod-01',
        adjustmentQty: -5,
        countedQty: 95,
        notes: 'Quarterly stocktake',
      },
    ],
    adjustedAt: '2024-03-01T00:00:00Z',
    adjustedBy: 'jane.doe',
  }

  it('maps id, locationId, and adjustedBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('adj-01')
    expect(result.locationId).toBe('loc-01')
    expect(result.adjustedBy).toBe('jane.doe')
    expect(result.platform).toBe('skusavvy')
  })

  it('maps reason "stocktake" to "cycle_count"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason "stock_take" to "cycle_count"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'stock_take' })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason "damage" to "damage"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'damaged item' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason containing "adjust" to "correction"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'quantity adjustment' })
    expect(result.reason).toBe('correction')
  })

  it('maps line items: productId, deltaQuantity, countedQuantity, notes', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-01')
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
    expect(result.lines[0]!.countedQuantity).toBe(95)
    expect(result.lines[0]!.notes).toBe('Quarterly stocktake')
  })

  it('maps adjustedAt as ISO string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces output satisfying StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
