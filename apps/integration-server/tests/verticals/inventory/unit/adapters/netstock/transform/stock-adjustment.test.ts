import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawNetstockStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/netstock/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('netstock transformStockAdjustment', () => {
  const raw: RawNetstockStockAdjustment = {
    id: 'adj-001',
    warehouseId: 'wh-001',
    reason: 'damage write-off',
    adjustedBy: 'operator1',
    adjustedAt: '2024-03-01T00:00:00Z',
    lines: [
      {
        itemId: 'item-001',
        deltaQty: -3,
        countedQty: 47,
        notes: 'Broken during handling',
      },
    ],
  }

  it('maps id and externalId from id field', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('adj-001')
    expect(result.externalId).toBe('adj-001')
  })

  it('maps locationId from warehouseId as string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('wh-001')
  })

  it('maps reason damage from reason field', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('damage')
  })

  it('maps reason cycle_count when reason includes count', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'stock count' })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps line productId from itemId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]?.productId).toBe('item-001')
  })

  it('maps line deltaQuantity from deltaQty', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]?.deltaQuantity).toBe(-3)
  })

  it('maps line countedQuantity from countedQty', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]?.countedQuantity).toBe(47)
  })

  it('maps adjustedBy field', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('operator1')
  })

  it('maps adjustedAt from adjustedAt field', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to netstock', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('netstock')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
