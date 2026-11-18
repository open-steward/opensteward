import { describe, it, expect } from 'vitest'
import { transformStockAdjustment } from '../../../../../../../src/verticals/inventory/adapters/inventree/transform/stock-adjustment'
import type { RawInvenTreeStockTracking } from '../../../../../../../src/verticals/inventory/adapters/inventree/transform/stock-transfer'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — inventree cycle count (tracking_type 10)', () => {
  const raw: RawInvenTreeStockTracking = {
    pk: 500,
    item: 42,
    date: '2024-03-01T00:00:00Z',
    tracking_type: 10,
    label: 'Stock Count',
    notes: 'Quarterly count',
    user: 7,
    deltas: {
      quantity: { prev: 90, new: 100 },
      location: { prev: null, new: 3 },
    },
  }
  const result = transformStockAdjustment(raw)

  it('sets id from pk', () => {
    expect(result.id).toBe('500')
  })

  it('maps tracking_type 10 → cycle_count reason', () => {
    expect(result.reason).toBe('cycle_count')
  })

  it('sets locationId from deltas.location.new', () => {
    expect(result.locationId).toBe('3')
  })

  it('sets deltaQuantity = new - prev', () => {
    expect(result.lines[0]?.deltaQuantity).toBe(10)
  })

  it('sets countedQuantity = new qty for cycle count', () => {
    expect(result.lines[0]?.countedQuantity).toBe(100)
  })

  it('sets productId from item', () => {
    expect(result.lines[0]?.productId).toBe('42')
  })

  it('sets adjustedBy from user', () => {
    expect(result.adjustedBy).toBe('7')
  })

  it('sets platform to inventree', () => {
    expect(result.platform).toBe('inventree')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — label-based reason mapping', () => {
  const makeRaw = (label: string): RawInvenTreeStockTracking => ({
    pk: 1,
    item: 1,
    date: '2024-03-01T00:00:00Z',
    tracking_type: 3,
    label,
    deltas: { quantity: { prev: 10, new: 8 } },
  })

  it('maps "damage" label → damage', () => {
    expect(transformStockAdjustment(makeRaw('Stock damaged')).reason).toBe('damage')
  })

  it('maps "correction" label → correction', () => {
    expect(transformStockAdjustment(makeRaw('Data correction')).reason).toBe('correction')
  })
})
