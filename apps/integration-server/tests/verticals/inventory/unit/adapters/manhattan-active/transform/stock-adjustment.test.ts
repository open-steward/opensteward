import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawManhattanActiveAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/manhattan-active/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('manhattan-active transformStockAdjustment', () => {
  const raw: RawManhattanActiveAdjustment = {
    adjustmentId: 'ADJ-001',
    locationId: 'LOC-001',
    locationName: 'Bin A-12',
    reasonCode: 'CYCLE_COUNT',
    reasonDescription: 'Routine cycle count',
    status: 'COMPLETED',
    lines: [
      {
        itemId: 'ITEM-001',
        adjustmentQuantity: 5,
        countedQuantity: 105,
        notes: 'Found extra units',
      },
    ],
    adjustmentDateTime: '2024-03-01T00:00:00Z',
    createdByUser: 'warehouse.manager',
  }

  it('maps id and externalId from adjustmentId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('ADJ-001')
    expect(result.externalId).toBe('ADJ-001')
  })

  it('maps locationId from locationId field', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('LOC-001')
  })

  it('maps reason from reasonCode containing "count"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason to damage when reasonCode contains damage', () => {
    const result = transformStockAdjustment({
      ...raw,
      reasonCode: 'DAMAGE',
      reasonDescription: undefined,
    })
    expect(result.reason).toBe('damage')
  })

  it('maps reason to correction when reasonCode contains adj', () => {
    const result = transformStockAdjustment({
      ...raw,
      reasonCode: 'ADJ',
      reasonDescription: 'adjustment',
    })
    expect(result.reason).toBe('correction')
  })

  it('maps lines from lines array', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('ITEM-001')
  })

  it('maps deltaQuantity directly from adjustmentQuantity', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].deltaQuantity).toBe(5)
  })

  it('maps negative deltaQuantity for decreases', () => {
    const result = transformStockAdjustment({
      ...raw,
      lines: [{ itemId: 'ITEM-001', adjustmentQuantity: -3, countedQuantity: 97 }],
    })
    expect(result.lines[0].deltaQuantity).toBe(-3)
  })

  it('maps countedQuantity from countedQuantity field', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].countedQuantity).toBe(105)
  })

  it('maps adjustedAt from adjustmentDateTime', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from createdByUser', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('warehouse.manager')
  })

  it('sets platform to manhattan-active', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('manhattan-active')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(raw))).not.toThrow()
  })
})
