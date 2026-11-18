import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawOracleWmsInventoryAdjustmentHdr,
} from '../../../../../../../src/verticals/inventory/adapters/oracle-wms/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('oracle-wms transformStockAdjustment', () => {
  const raw: RawOracleWmsInventoryAdjustmentHdr = {
    inv_adj_hdr_id: 7001,
    location_id: 101,
    adj_reason_code: 'CYCLE_COUNT',
    adj_reason: 'Cycle count adjustment',
    status: 'Completed',
    adj_date: '2024-03-01T00:00:00Z',
    created_by: 'Jane Doe',
    company_id: 1,
    inventory_adjustment_dtl_set: [
      {
        inv_adj_dtl_id: 1,
        item_id: 5001,
        adj_qty: -5,
        counted_qty: 245,
        notes: 'Short count',
      },
    ],
  }

  it('maps id and externalId from inv_adj_hdr_id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('7001')
    expect(result.externalId).toBe('7001')
  })

  it('maps locationId from location_id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('101')
  })

  it('maps CYCLE_COUNT reason code to cycle_count', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps DAMAGE reason code to damage', () => {
    const result = transformStockAdjustment({
      ...raw,
      adj_reason_code: 'DAMAGE',
      adj_reason: 'Damage write-off',
    })
    expect(result.reason).toBe('damage')
  })

  it('maps lines with productId from item_id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('5001')
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
    expect(result.lines[0]!.countedQuantity).toBe(245)
  })

  it('maps notes from line notes field', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]!.notes).toBe('Short count')
  })

  it('maps adjustedAt from adj_date', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from created_by', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('sets platform to oracle-wms', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('oracle-wms')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
