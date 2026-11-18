import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawMrpeasyStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/mrpeasy/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('mrpeasy transformStockAdjustment', () => {
  // MRPeasy dates are Unix timestamps; 1709251200 = 2024-03-01T00:00:00Z
  const raw: RawMrpeasyStockAdjustment = {
    adjustment_id: 600,
    site_id: 3,
    reason: 'damage write-off',
    date: 1709251200,
    user: 'operator1',
    items: [
      {
        article_id: 100,
        delta: -5,
        counted: 45,
        notes: 'Dropped during handling',
      },
    ],
  }

  it('maps id and externalId from adjustment_id as string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('600')
    expect(result.externalId).toBe('600')
  })

  it('maps locationId from site_id as string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('3')
  })

  it('maps reason damage from reason field', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('damage')
  })

  it('maps reason cycle_count when reason includes count', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'count adjustment' })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps line productId from article_id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]?.productId).toBe('100')
  })

  it('maps line deltaQuantity from delta', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]?.deltaQuantity).toBe(-5)
  })

  it('maps line countedQuantity from counted', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]?.countedQuantity).toBe(45)
  })

  it('maps adjustedBy from user', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('operator1')
  })

  it('converts unix timestamp date to ISO string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to mrpeasy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('mrpeasy')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
