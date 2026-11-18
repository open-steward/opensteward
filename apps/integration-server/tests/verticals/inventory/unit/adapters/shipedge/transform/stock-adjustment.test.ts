import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawShipEdgeStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/shipedge/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('shipedge transformStockAdjustment', () => {
  const raw: RawShipEdgeStockAdjustment = {
    adjustment_id: 'ADJ-500',
    warehouse: 'MAIN-WH',
    reason: 'damage found during inspection',
    status: 'completed',
    items: [
      {
        sku: 'WKB-100',
        delta: -5,
        qty_counted: 195,
        notes: 'Cracked packaging',
      },
    ],
    adjusted_date: '2024-03-01T00:00:00Z',
    adjusted_by: 'warehouse_manager',
  }

  it('maps adjustment_id to id and externalId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('ADJ-500')
    expect(result.externalId).toBe('ADJ-500')
  })

  it('maps warehouse to locationId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('MAIN-WH')
  })

  it('maps reason containing "damage" to "damage"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('damage')
  })

  it('maps reason containing "theft" to "theft"', () => {
    const theft: RawShipEdgeStockAdjustment = { ...raw, reason: 'theft detected' }
    expect(transformStockAdjustment(theft).reason).toBe('theft')
  })

  it('maps reason containing "count" to "cycle_count"', () => {
    const count: RawShipEdgeStockAdjustment = { ...raw, reason: 'cycle count audit' }
    expect(transformStockAdjustment(count).reason).toBe('cycle_count')
  })

  it('maps items to lines with sku as productId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('WKB-100')
    expect(result.lines[0].deltaQuantity).toBe(-5)
    expect(result.lines[0].countedQuantity).toBe(195)
    expect(result.lines[0].notes).toBe('Cracked packaging')
  })

  it('maps adjusted_date to adjustedAt', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjusted_by to adjustedBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('warehouse_manager')
  })

  it('satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(raw))).not.toThrow()
  })
})
