import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawOngoingWmsInventoryAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/ongoing-wms/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('ongoing-wms transformStockAdjustment', () => {
  const raw: RawOngoingWmsInventoryAdjustment = {
    article: {
      articleSystemId: 18068,
      articleNumber: 'ART-001',
      articleName: 'Wireless Keyboard',
    },
    adjustment: {
      inventoryId: 107,
      numberOfItems: -2,
      inventoryTime: '2024-03-01T00:00:00Z',
      inventoryItemComment: 'Dropped on floor',
      inventoryAdjustmentCause: { code: 'DMG', name: 'damage' },
      location: 'A15',
      batchNumber: 'BATCH-001',
      serial: '',
    },
  }

  it('maps id and externalId from inventoryId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('107')
    expect(result.externalId).toBe('107')
  })

  it('maps locationId from adjustment.location', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('A15')
  })

  it('maps reason from cause name text — "damage" → damage', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('damage')
  })

  it('maps lines with productId from article.articleSystemId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('18068')
    expect(result.lines[0]!.deltaQuantity).toBe(-2)
  })

  it('maps adjustedAt from inventoryTime', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to ongoing-wms', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('ongoing-wms')
  })

  it('maps reason to cycle_count when cause contains "count"', () => {
    const result = transformStockAdjustment({
      ...raw,
      adjustment: {
        ...raw.adjustment,
        inventoryAdjustmentCause: { code: 'INV_COUNT', name: 'inventory count' },
      },
    })
    expect(result.reason).toBe('cycle_count')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
