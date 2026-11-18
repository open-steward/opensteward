import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSosInventoryStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/sos-inventory/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('sos-inventory transformStockAdjustment', () => {
  const raw: RawSosInventoryStockAdjustment = {
    id: 300,
    location: { id: 5, name: 'Seattle Fulfillment' },
    reason: 'cycle count',
    memo: 'Q1 inventory review',
    date: '2024-03-01T00:00:00Z',
    createdBy: 'alice',
    lines: [
      {
        item: { id: 99, name: 'Bulk Widget' },
        quantity: -2,
        newQuantity: 48,
        notes: 'Missing after audit',
      },
    ],
  }

  it('maps id (numeric) as string, locationId from location.id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('300')
    expect(result.locationId).toBe('5')
    expect(result.platform).toBe('sos-inventory')
  })

  it('maps reason "cycle count" to "cycle_count"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason "damage" to "damage"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'damage detected' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason "correction" to "correction"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'data correction' })
    expect(result.reason).toBe('correction')
  })

  it('maps reason "expiration" to "expiration"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'product expiration' })
    expect(result.reason).toBe('expiration')
  })

  it('maps line items: productId from item.id, deltaQuantity, countedQuantity, notes', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('99')
    expect(result.lines[0]!.deltaQuantity).toBe(-2)
    expect(result.lines[0]!.countedQuantity).toBe(48)
    expect(result.lines[0]!.notes).toBe('Missing after audit')
  })

  it('maps date to adjustedAt as ISO string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps createdBy to adjustedBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('alice')
  })

  it('stores memo in metadata', () => {
    const result = transformStockAdjustment(raw)
    expect(result.metadata['memo']).toBe('Q1 inventory review')
  })

  it('produces output satisfying StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
