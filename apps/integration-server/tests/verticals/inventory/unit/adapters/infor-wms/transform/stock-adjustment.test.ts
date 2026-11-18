import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawInforWmsAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/infor-wms/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('infor-wms transformStockAdjustment', () => {
  const raw: RawInforWmsAdjustment = {
    adjustmentId: 'ADJ-WMS-001',
    warehouseId: 'WH-001',
    adjustmentType: 'CYCLE_COUNT',
    adjustmentDate: '2024-03-01T00:00:00Z',
    adjustedBy: 'wms_operator',
    status: 'POSTED',
    lines: [
      { itemNumber: 'ITEM-001', adjustmentQty: -10, countedQty: 90, notes: 'recount result' },
    ],
  }

  it('maps id and externalId from adjustmentId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('ADJ-WMS-001')
    expect(result.externalId).toBe('ADJ-WMS-001')
  })

  it('maps locationId from warehouseId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('WH-001')
  })

  it('maps CYCLE_COUNT adjustmentType to cycle_count', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps DAMAGE adjustmentType to damage', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentType: 'DAMAGE' })
    expect(result.reason).toBe('damage')
  })

  it('maps MANUAL adjustmentType to correction', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentType: 'MANUAL' })
    expect(result.reason).toBe('correction')
  })

  it('maps lines correctly', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('ITEM-001')
    expect(result.lines[0]!.deltaQuantity).toBe(-10)
    expect(result.lines[0]!.countedQuantity).toBe(90)
    expect(result.lines[0]!.notes).toBe('recount result')
  })

  it('maps adjustedAt from adjustmentDate', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults adjustedAt to epoch when absent', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentDate: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('sets platform to infor-wms', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('infor-wms')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
