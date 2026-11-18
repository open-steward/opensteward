import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawCamelot3plStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/camelot-3pl/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('camelot-3pl transformStockAdjustment', () => {
  const raw: RawCamelot3plStockAdjustment = {
    adjustmentId: 'adj-001',
    warehouseId: 'wh-001',
    adjustmentReason: 'Cycle Count',
    status: 'completed',
    lines: [
      {
        itemId: 'item-001',
        quantityDelta: -2,
        quantityCounted: 48,
        notes: 'Found 2 fewer than expected',
      },
    ],
    adjustmentDate: '2024-03-01T00:00:00Z',
    adjustedByUser: 'jsmith',
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

  it('maps cycle_count reason', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps damage reason', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentReason: 'Damaged goods' })
    expect(result.reason).toBe('damage')
  })

  it('maps theft reason', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentReason: 'Theft' })
    expect(result.reason).toBe('theft')
  })

  it('maps correction reason for error', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentReason: 'Data error correction' })
    expect(result.reason).toBe('correction')
  })

  it('maps line items', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-001')
    expect(result.lines[0]!.deltaQuantity).toBe(-2)
    expect(result.lines[0]!.countedQuantity).toBe(48)
    expect(result.lines[0]!.notes).toBe('Found 2 fewer than expected')
  })

  it('maps adjustedAt from adjustmentDate', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from adjustedByUser', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('jsmith')
  })

  it('sets platform to camelot-3pl', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('camelot-3pl')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
