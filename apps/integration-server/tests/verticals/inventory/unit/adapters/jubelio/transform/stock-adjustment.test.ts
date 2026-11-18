import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawJubelioStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/jubelio/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — jubelio', () => {
  const raw: RawJubelioStockAdjustment = {
    adjustment_id: 300,
    location_id: 5,
    location_name: 'Main Warehouse',
    reason: 'stock opname',
    notes: 'Monthly stock count',
    status: 'completed',
    adjustment_date: '2024-03-01T00:00:00Z',
    created_by: 'admin',
    items: [
      {
        item_id: 100,
        qty_difference: 5,
        qty_counted: 105,
        notes: 'Counted 105, was 100',
      },
    ],
  }
  const result = transformStockAdjustment(raw)

  it('sets id from adjustment_id', () => {
    expect(result.id).toBe('300')
  })

  it('sets locationId from location_id', () => {
    expect(result.locationId).toBe('5')
  })

  it('maps "opname" reason → cycle_count', () => {
    expect(result.reason).toBe('cycle_count')
  })

  it('sets line productId from item_id', () => {
    expect(result.lines[0]?.productId).toBe('100')
  })

  it('sets line deltaQuantity from qty_difference', () => {
    expect(result.lines[0]?.deltaQuantity).toBe(5)
  })

  it('sets line countedQuantity from qty_counted', () => {
    expect(result.lines[0]?.countedQuantity).toBe(105)
  })

  it('sets adjustedAt from adjustment_date', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets adjustedBy from created_by', () => {
    expect(result.adjustedBy).toBe('admin')
  })

  it('sets platform to jubelio', () => {
    expect(result.platform).toBe('jubelio')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — Indonesian reason keywords', () => {
  const makeRaw = (reason: string): RawJubelioStockAdjustment => ({
    adjustment_id: 1,
    location_id: 1,
    adjustment_date: '2024-03-01T00:00:00Z',
    reason,
    items: [{ item_id: 1, qty_difference: -1 }],
  })

  it('maps "rusak" → damage', () => {
    expect(transformStockAdjustment(makeRaw('rusak')).reason).toBe('damage')
  })

  it('maps "hilang" → theft', () => {
    expect(transformStockAdjustment(makeRaw('hilang')).reason).toBe('theft')
  })

  it('maps "kadaluarsa" → expiration', () => {
    expect(transformStockAdjustment(makeRaw('kadaluarsa')).reason).toBe('expiration')
  })

  it('maps "koreksi" → correction', () => {
    expect(transformStockAdjustment(makeRaw('koreksi')).reason).toBe('correction')
  })
})
