import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawJushuitanStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/jushuitan/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('jushuitan transformStockAdjustment', () => {
  const raw: RawJushuitanStockAdjustment = {
    check_id: 300,
    wms_co_id: 42,
    type: 'cycle count',
    status: 'completed',
    operator: 'john.doe',
    check_date: '2024-03-01T00:00:00Z',
    items: [
      {
        sku_id: 1001,
        qty_check: 100,
        qty_diff: -5,
        note: 'Short on recount',
      },
    ],
  }

  it('maps id from check_id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('300')
    expect(result.externalId).toBe('300')
  })

  it('maps locationId from wms_co_id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('42')
  })

  it('maps reason cycle_count from "cycle count"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason damage from "damage" keyword', () => {
    const result = transformStockAdjustment({ ...raw, type: 'damage loss' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason theft from keyword', () => {
    const result = transformStockAdjustment({ ...raw, type: 'theft' })
    expect(result.reason).toBe('theft')
  })

  it('defaults reason to other for unknown type', () => {
    const result = transformStockAdjustment({ ...raw, type: 'miscellaneous' })
    expect(result.reason).toBe('other')
  })

  it('maps line items', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('1001')
    expect(result.lines[0].deltaQuantity).toBe(-5)
    expect(result.lines[0].countedQuantity).toBe(100)
    expect(result.lines[0].notes).toBe('Short on recount')
  })

  it('maps adjustedAt from check_date', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from operator', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('john.doe')
  })

  it('sets platform to jushuitan', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('jushuitan')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(raw))).not.toThrow()
  })
})
