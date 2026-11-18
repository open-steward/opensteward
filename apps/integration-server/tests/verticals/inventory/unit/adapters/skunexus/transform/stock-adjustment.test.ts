import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSkuNexusStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/skunexus/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('skunexus transformStockAdjustment', () => {
  const raw: RawSkuNexusStockAdjustment = {
    id: 'ADJ-1',
    location_id: 'LOC-5',
    reason: 'cycle count',
    line_items: [
      {
        id: 'LI-1',
        product_id: 'PROD-1',
        quantity_delta: -3,
        counted_quantity: 47,
        notes: 'Recount after audit',
      },
    ],
    adjusted_at: '2024-03-01T00:00:00Z',
    adjusted_by: 'jane.doe',
  }

  it('maps id, locationId, and adjustedBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('ADJ-1')
    expect(result.locationId).toBe('LOC-5')
    expect(result.adjustedBy).toBe('jane.doe')
    expect(result.platform).toBe('skunexus')
  })

  it('maps reason "cycle count" to "cycle_count"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason substring "damage" to "damage"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'damaged goods' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason "theft" substring to "theft"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'theft in store' })
    expect(result.reason).toBe('theft')
  })

  it('maps reason "expir" substring to "expiration"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'product expiration' })
    expect(result.reason).toBe('expiration')
  })

  it('maps line items: productId, deltaQuantity, countedQuantity, notes', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('PROD-1')
    expect(result.lines[0]!.deltaQuantity).toBe(-3)
    expect(result.lines[0]!.countedQuantity).toBe(47)
    expect(result.lines[0]!.notes).toBe('Recount after audit')
  })

  it('falls back to quantity_adjusted when quantity_delta is absent', () => {
    const result = transformStockAdjustment({
      ...raw,
      line_items: [{ product_id: 'P2', quantity_adjusted: 5 }],
    })
    expect(result.lines[0]!.deltaQuantity).toBe(5)
  })

  it('maps adjustedAt as ISO string', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces output satisfying StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
