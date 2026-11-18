import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawGofrugalStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/gofrugal/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('gofrugal transformStockAdjustment', () => {
  const raw: RawGofrugalStockAdjustment = {
    adjustmentId: 99,
    locationId: 3,
    reason: 'damage to goods in storage',
    adjustedBy: 'manager1',
    adjustedAt: '2024-03-01T00:00:00Z',
    lines: [{ itemId: 101, deltaQty: -5, countedQty: 45, notes: 'water damage' }],
  }

  it('maps id and externalId from adjustmentId as string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('99')
    expect(result.externalId).toBe('99')
  })

  it('maps locationId as string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('3')
  })

  it('maps damage reason by keyword match', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('damage')
  })

  it('maps lines correctly', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('101')
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
    expect(result.lines[0]!.countedQuantity).toBe(45)
  })

  it('maps adjustedAt ISO date', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps cycle_count reason', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'stock count cycle' })
    expect(result.reason).toBe('cycle_count')
  })

  it('defaults adjustedAt to epoch when absent', () => {
    const result = transformStockAdjustment({ ...raw, adjustedAt: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('falls back locationId to empty string when absent', () => {
    const result = transformStockAdjustment({ ...raw, locationId: undefined })
    expect(result.locationId).toBe('')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
