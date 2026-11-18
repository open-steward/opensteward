import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawEccangStockAdjustment,
  type RawEccangStockAdjustmentLine,
} from '../../../../../../../src/verticals/inventory/adapters/eccang/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('eccang transformStockAdjustment', () => {
  const line: RawEccangStockAdjustmentLine = {
    goods_id: 2001,
    sku_id: 3001,
    goods_no: 'GN-2001',
    adjust_qty: -5,
    actual_qty: 95,
    remark: 'Water damage',
  }

  const raw: RawEccangStockAdjustment = {
    adjust_order_id: 6001,
    adjust_order_no: 'ADJ-6001',
    warehouse_id: 101,
    warehouse_code: 'SZ-MAIN',
    adjust_reason: 'damage',
    status: 'confirmed',
    adjust_time: '2024-03-01T00:00:00.000Z',
    operator: 'operator@eccang.example',
    items: [line],
  }

  it('maps id and externalId from adjust_order_id as string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('6001')
    expect(result.externalId).toBe('6001')
  })

  it('maps locationId from warehouse_id as string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('101')
  })

  it('falls back to warehouse_code for locationId when warehouse_id absent', () => {
    const result = transformStockAdjustment({ ...raw, warehouse_id: undefined })
    expect(result.locationId).toBe('SZ-MAIN')
  })

  it('maps reason damage from adjust_reason containing "damage"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('damage')
  })

  it('maps reason cycle_count from adjust_reason containing "count"', () => {
    const result = transformStockAdjustment({ ...raw, adjust_reason: 'stock count' })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason cycle_count from Chinese keyword 盘点', () => {
    const result = transformStockAdjustment({ ...raw, adjust_reason: '盘点' })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason theft from adjust_reason containing "theft"', () => {
    const result = transformStockAdjustment({ ...raw, adjust_reason: 'theft' })
    expect(result.reason).toBe('theft')
  })

  it('maps reason lost from adjust_reason containing "lost"', () => {
    const result = transformStockAdjustment({ ...raw, adjust_reason: 'lost items' })
    expect(result.reason).toBe('lost')
  })

  it('maps reason found from adjust_reason containing "found"', () => {
    const result = transformStockAdjustment({ ...raw, adjust_reason: 'found stock' })
    expect(result.reason).toBe('found')
  })

  it('maps reason expiration from adjust_reason containing "expir"', () => {
    const result = transformStockAdjustment({ ...raw, adjust_reason: 'expiration' })
    expect(result.reason).toBe('expiration')
  })

  it('maps reason correction from adjust_reason containing "correct"', () => {
    const result = transformStockAdjustment({ ...raw, adjust_reason: 'correction entry' })
    expect(result.reason).toBe('correction')
  })

  it('maps reason other for unknown adjust_reason', () => {
    const result = transformStockAdjustment({ ...raw, adjust_reason: 'misc' })
    expect(result.reason).toBe('other')
  })

  it('maps line productId from sku_id as string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].productId).toBe('3001')
  })

  it('maps line deltaQuantity from adjust_qty', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].deltaQuantity).toBe(-5)
  })

  it('maps line countedQuantity from actual_qty', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].countedQuantity).toBe(95)
  })

  it('maps line notes from remark', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].notes).toBe('Water damage')
  })

  it('maps adjustedAt from adjust_time', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back adjustedAt to epoch when adjust_time absent', () => {
    const result = transformStockAdjustment({ ...raw, adjust_time: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('maps adjustedBy from operator', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('operator@eccang.example')
  })

  it('sets platform to eccang', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('eccang')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
