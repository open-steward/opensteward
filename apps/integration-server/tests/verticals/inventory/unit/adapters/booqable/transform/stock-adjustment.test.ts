import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawBooqableStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/booqable/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('booqable transformStockAdjustment', () => {
  const raw: RawBooqableStockAdjustment = {
    id: 'adj-001',
    type: 'stock_adjustments',
    attributes: {
      id: 'adj-001',
      product_id: 'prod-001',
      location_id: 'loc-001',
      quantity: 5,
      reason: 'Damage',
      note: 'Items damaged during transport',
      employee_id: 'emp-001',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    },
  }

  it('maps id and externalId from resource id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('adj-001')
    expect(result.externalId).toBe('adj-001')
  })

  it('maps locationId from location_id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('loc-001')
  })

  it('maps damage reason', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('damage')
  })

  it('maps cycle_count reason', () => {
    const result = transformStockAdjustment({
      ...raw,
      attributes: { ...raw.attributes, reason: 'Cycle Count' },
    })
    expect(result).not.toHaveProperty('result')
    const r = transformStockAdjustment({
      ...raw,
      attributes: { ...raw.attributes, reason: 'Cycle Count' },
    })
    expect(r.reason).toBe('cycle_count')
  })

  it('builds line item from product_id and quantity', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-001')
    expect(result.lines[0]!.deltaQuantity).toBe(5)
  })

  it('maps adjustedAt from created_at', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from employee_id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('emp-001')
  })

  it('sets platform to booqable', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('booqable')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
