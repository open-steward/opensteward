import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawRevelInventoryAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/revel-systems/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('revel-systems transformStockAdjustment', () => {
  const raw: RawRevelInventoryAdjustment = {
    id: 77,
    establishment: '/resources/Establishment/5/',
    reason: 'Count',
    created_date: '2024-03-01T00:00:00Z',
    user: '/resources/User/9/',
    inventory_adjustment_items: [
      {
        id: 1,
        ingredient: '/resources/Ingredient/20/',
        quantity_change: -5,
        quantity: 45,
        notes: 'end of day count',
      },
    ],
  }

  it('stringifies numeric id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('extracts locationId from establishment URI', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('5')
  })

  it('maps "Count" reason to cycle_count', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason strings', () => {
    expect(transformStockAdjustment({ ...raw, reason: 'Damage' }).reason).toBe('damage')
    expect(transformStockAdjustment({ ...raw, reason: 'Theft' }).reason).toBe('theft')
    expect(transformStockAdjustment({ ...raw, reason: 'Lost' }).reason).toBe('lost')
    expect(transformStockAdjustment({ ...raw, reason: 'Found' }).reason).toBe('found')
    expect(transformStockAdjustment({ ...raw, reason: 'Waste' }).reason).toBe('expiration')
    expect(transformStockAdjustment({ ...raw, reason: 'Expiration' }).reason).toBe('expiration')
    expect(transformStockAdjustment({ ...raw, reason: 'Correction' }).reason).toBe('correction')
    expect(transformStockAdjustment({ ...raw, reason: 'Misc' }).reason).toBe('other')
  })

  it('extracts productId from ingredient URI', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]!.productId).toBe('20')
  })

  it('maps deltaQuantity and countedQuantity', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
    expect(result.lines[0]!.countedQuantity).toBe(45)
    expect(result.lines[0]!.notes).toBe('end of day count')
  })

  it('maps adjustedAt from created_date', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('extracts adjustedBy from user URI', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('9')
  })

  it('falls back adjustedAt to epoch when created_date is absent', () => {
    const result = transformStockAdjustment({ ...raw, created_date: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('sets adjustedBy to undefined when user is null', () => {
    const result = transformStockAdjustment({ ...raw, user: null })
    expect(result.adjustedBy).toBeUndefined()
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
