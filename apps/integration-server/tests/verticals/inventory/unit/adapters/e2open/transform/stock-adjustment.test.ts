import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawE2openStockAdjustment,
  type RawE2openStockAdjustmentLine,
} from '../../../../../../../src/verticals/inventory/adapters/e2open/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('e2open transformStockAdjustment', () => {
  const line: RawE2openStockAdjustmentLine = {
    itemId: 'ITEM-001',
    deltaQty: -10,
    countedQty: 90,
    notes: 'Found damaged units',
  }

  const raw: RawE2openStockAdjustment = {
    adjustmentId: 'ADJ-001',
    locationId: 'LOC-001',
    adjustmentReason: 'damage',
    adjustmentType: 'WRITEOFF',
    status: 'POSTED',
    lines: [line],
    adjustmentDate: '2024-03-01T00:00:00.000Z',
    adjustedBy: 'warehouse.manager@example.com',
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

  it('maps reason damage from adjustmentReason containing "damage"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('damage')
  })

  it('maps reason cycle_count from adjustmentReason containing "count"', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentReason: 'cyclecount' })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason correction from adjustmentReason containing "writeoff"', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentReason: 'writeoff' })
    expect(result.reason).toBe('correction')
  })

  it('maps reason theft from adjustmentReason containing "theft"', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentReason: 'theft' })
    expect(result.reason).toBe('theft')
  })

  it('maps reason other for unknown adjustmentReason', () => {
    const result = transformStockAdjustment({
      ...raw,
      adjustmentReason: 'unknown',
      adjustmentType: undefined,
    })
    expect(result.reason).toBe('other')
  })

  it('maps line productId from itemId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].productId).toBe('ITEM-001')
  })

  it('maps line productId from partnerSkuCode when itemId absent', () => {
    const result = transformStockAdjustment({
      ...raw,
      lines: [{ partnerSkuCode: 'SKU-001', deltaQty: -5 }],
    })
    expect(result.lines[0].productId).toBe('SKU-001')
  })

  it('maps line deltaQuantity from deltaQty', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].deltaQuantity).toBe(-10)
  })

  it('maps line countedQuantity from countedQty', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].countedQuantity).toBe(90)
  })

  it('maps line notes from notes', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].notes).toBe('Found damaged units')
  })

  it('maps adjustedAt from adjustmentDate', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back adjustedAt to epoch when adjustmentDate absent', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentDate: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('maps adjustedBy from adjustedBy field', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('warehouse.manager@example.com')
  })

  it('sets platform to e2open', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('e2open')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
