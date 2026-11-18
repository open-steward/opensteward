import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawXentralStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/xentral/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

const rawAdj: RawXentralStockAdjustment = {
  id: 77,
  warehouseId: 3,
  reason: 'Inventur count',
  note: 'Annual stock count Q1',
  createdBy: 'warehouse.manager',
  createdAt: '2024-03-01T00:00:00Z',
  lines: [
    { productId: 'prod-99', deltaQuantity: -10, countedQuantity: 90, note: 'Short count' },
    { productId: 'prod-100', deltaQuantity: 5, note: undefined },
  ],
}

describe('xentral transformStockAdjustment', () => {
  it('converts numeric id to string id', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('maps warehouseId to locationId as string', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.locationId).toBe('3')
  })

  it('maps "Inventur count" reason keyword to "cycle_count"', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps lines array to canonical lines', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]!.productId).toBe('prod-99')
    expect(result.lines[0]!.deltaQuantity).toBe(-10)
    expect(result.lines[0]!.countedQuantity).toBe(90)
    expect(result.lines[0]!.notes).toBe('Short count')
  })

  it('maps createdAt to adjustedAt as ISO string', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps createdBy to adjustedBy', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.adjustedBy).toBe('warehouse.manager')
  })

  it('sets platform=xentral', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.platform).toBe('xentral')
  })

  it('produces a schema-valid StockAdjustment', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })

  it('maps "defekt" reason keyword to "damage"', () => {
    const result = transformStockAdjustment({ ...rawAdj, reason: 'defekt - broken parts' })
    expect(result.reason).toBe('damage')
  })

  it('maps "korrektur" keyword to "correction"', () => {
    const result = transformStockAdjustment({ ...rawAdj, reason: 'lagerkorrektur' })
    expect(result.reason).toBe('correction')
  })

  it('defaults locationId to empty string when warehouseId is null', () => {
    const result = transformStockAdjustment({ ...rawAdj, warehouseId: undefined })
    expect(result.locationId).toBe('')
  })
})
