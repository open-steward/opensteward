import { describe, it, expect } from 'vitest'
import { transformStockAdjustment } from '../../../../../../../src/verticals/inventory/adapters/agiliron/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment', () => {
  const raw = {
    AdjustmentId: 'ADJ-001',
    ProductCode: 'WK-2026',
    StockLocation: 'Warehouse A',
    QtyChange: -10,
    Reason: 'damage',
    AdjustedBy: 'Jane Doe',
    AdjustedOn: '2024-03-01T00:00:00Z',
  }

  it('maps id, locationId, and reason', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('ADJ-001')
    expect(result.locationId).toBe('Warehouse A')
    expect(result.reason).toBe('damage')
    expect(result.platform).toBe('agiliron')
  })

  it('maps delta quantity in lines', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]?.deltaQuantity).toBe(-10)
    expect(result.lines[0]?.productId).toBe('WK-2026')
  })

  it('maps adjustedBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
