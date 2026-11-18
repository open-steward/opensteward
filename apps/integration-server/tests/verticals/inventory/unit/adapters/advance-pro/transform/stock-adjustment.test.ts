import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawAdvanceProStockAdjustment,
  type RawAdvanceProAdjustmentLine,
} from '../../../../../../../src/verticals/inventory/adapters/advance-pro/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

const rawLine: RawAdvanceProAdjustmentLine = {
  productId: '42',
  deltaQuantity: -5,
  countedQuantity: 95,
}

const rawAdjustment: RawAdvanceProStockAdjustment = {
  id: '7',
  warehouseId: '5',
  reason: 'cycle count',
  adjustedDate: '2024-03-01T00:00:00Z',
  adjustedBy: 'Jane Doe',
  lines: [rawLine],
}

describe('transformStockAdjustment', () => {
  it('maps id and locationId', () => {
    const result = transformStockAdjustment(rawAdjustment)
    expect(result.id).toBe('7')
    expect(result.locationId).toBe('5')
  })

  it('maps reason from text to cycle_count', () => {
    const result = transformStockAdjustment(rawAdjustment)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps line deltaQuantity and countedQuantity', () => {
    const result = transformStockAdjustment(rawAdjustment)
    expect(result.lines[0]?.deltaQuantity).toBe(-5)
    expect(result.lines[0]?.countedQuantity).toBe(95)
  })

  it('maps platform and adjustedBy', () => {
    const result = transformStockAdjustment(rawAdjustment)
    expect(result.platform).toBe('advance-pro')
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('passes StockAdjustmentSchema validation', () => {
    const result = transformStockAdjustment(rawAdjustment)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
