import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawVendStockAdjustment,
  type RawVendStockAdjustmentLine,
} from '../../../../../../../src/verticals/inventory/adapters/vend-pos/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

const baseLines: RawVendStockAdjustmentLine[] = [
  { product_id: 'prod-uuid-001', count: 50, received: 48, notes: 'shelf count' },
]

const baseRaw: RawVendStockAdjustment = {
  id: 'stocktake-uuid-001',
  outlet_id: 'outlet-uuid-001',
  type: 'STOCKTAKE',
  name: 'March Stocktake',
  status: 'STOCKTAKE_COMPLETE',
  due_at: '2024-03-10T00:00:00Z',
  updated_at: '2024-03-01T00:00:00Z',
  consignment_products: baseLines,
}

describe('vend-pos transformStockAdjustment', () => {
  it('maps id from id field', () => {
    expect(transformStockAdjustment(baseRaw).id).toBe('stocktake-uuid-001')
  })

  it('maps locationId from outlet_id', () => {
    expect(transformStockAdjustment(baseRaw).locationId).toBe('outlet-uuid-001')
  })

  it('hardcodes reason to cycle_count for all STOCKTAKE consignments', () => {
    expect(transformStockAdjustment(baseRaw).reason).toBe('cycle_count')
  })

  it('maps lines with productId from product_id', () => {
    const result = transformStockAdjustment(baseRaw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-uuid-001')
  })

  it('uses 0 as deltaQuantity sentinel (delta not available at consignment level)', () => {
    // Vend does not expose delta at consignment level; 0 is the documented sentinel
    expect(transformStockAdjustment(baseRaw).lines[0]!.deltaQuantity).toBe(0)
  })

  it('maps countedQuantity from received field', () => {
    expect(transformStockAdjustment(baseRaw).lines[0]!.countedQuantity).toBe(48)
  })

  it('maps adjustedAt from updated_at', () => {
    expect(transformStockAdjustment(baseRaw).adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to due_at when updated_at is absent', () => {
    const result = transformStockAdjustment({ ...baseRaw, updated_at: undefined })
    expect(result.adjustedAt).toBe('2024-03-10T00:00:00.000Z')
  })

  it('sets platform to vend-pos', () => {
    expect(transformStockAdjustment(baseRaw).platform).toBe('vend-pos')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(baseRaw))).not.toThrow()
  })
})
