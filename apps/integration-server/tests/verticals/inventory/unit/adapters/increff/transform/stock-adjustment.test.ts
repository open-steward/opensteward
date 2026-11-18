import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawIncreffStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/increff/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('increff transformStockAdjustment', () => {
  const raw: RawIncreffStockAdjustment = {
    adjustmentCode: 'ADJ-2024-001',
    warehouseCode: 'WH-MUM-01',
    reason: 'cycle count discrepancy',
    adjustedOn: '2024-03-01T00:00:00Z',
    adjustedBy: 'warehouse_manager',
    items: [{ skuCode: 'SKU-001', deltaQty: -3, countedQty: 47, notes: 'recount done' }],
  }

  it('maps id and externalId from adjustmentCode', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('ADJ-2024-001')
    expect(result.externalId).toBe('ADJ-2024-001')
  })

  it('maps locationId from warehouseCode', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('WH-MUM-01')
  })

  it('maps cycle_count reason by keyword', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason from remarks when reason absent', () => {
    const result = transformStockAdjustment({ ...raw, reason: undefined, remarks: 'damage report' })
    expect(result.reason).toBe('damage')
  })

  it('maps lines correctly', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('SKU-001')
    expect(result.lines[0]!.deltaQuantity).toBe(-3)
    expect(result.lines[0]!.countedQuantity).toBe(47)
  })

  it('maps adjustedAt ISO date', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults adjustedAt to epoch when absent', () => {
    const result = transformStockAdjustment({ ...raw, adjustedOn: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('sets platform to increff', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('increff')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
