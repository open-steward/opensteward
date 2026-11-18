import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawEasyEcomStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/easyecom/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('easyecom transformStockAdjustment', () => {
  const raw: RawEasyEcomStockAdjustment = {
    adjustment_id: 'ADJ-001',
    warehouse_id: 42,
    reason: 'damage',
    status: 'APPROVED',
    items: [
      {
        sku: 'SKU-001',
        product_id: 'PROD-001',
        adjusted_qty: -3,
        counted_qty: 97,
        notes: 'Packaging damaged',
      },
    ],
    adjustment_date: '2024-03-01T00:00:00.000Z',
    adjusted_by: 'warehouse.staff',
  }

  it('maps id and externalId from adjustment_id as string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('ADJ-001')
    expect(result.externalId).toBe('ADJ-001')
  })

  it('maps locationId from warehouse_id as string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('42')
  })

  it('maps reason damage from reason containing "damage"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('damage')
  })

  it('maps reason cycle_count from reason containing "count"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'stock count' })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason cycle_count from reason containing "audit"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'audit' })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason theft from reason containing "theft"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'theft' })
    expect(result.reason).toBe('theft')
  })

  it('maps reason lost from reason containing "missing"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'missing items' })
    expect(result.reason).toBe('lost')
  })

  it('maps reason correction from reason containing "error"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'data error' })
    expect(result.reason).toBe('correction')
  })

  it('maps reason other for unknown reason', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'miscellaneous' })
    expect(result.reason).toBe('other')
  })

  it('maps line productId from product_id as string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].productId).toBe('PROD-001')
  })

  it('maps line deltaQuantity from adjusted_qty', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].deltaQuantity).toBe(-3)
  })

  it('maps line countedQuantity from counted_qty', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].countedQuantity).toBe(97)
  })

  it('maps line notes from notes', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].notes).toBe('Packaging damaged')
  })

  it('maps adjustedAt from adjustment_date', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back adjustedAt to epoch when adjustment_date absent', () => {
    const result = transformStockAdjustment({ ...raw, adjustment_date: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('maps adjustedBy from adjusted_by', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('warehouse.staff')
  })

  it('sets platform to easyecom', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('easyecom')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
