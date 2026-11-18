import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawTruecommerceStockAdjustment,
  type RawTruecommerceStockAdjustmentLine,
} from '../../../../../../../src/verticals/inventory/adapters/truecommerce/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeLine(
  overrides: Partial<RawTruecommerceStockAdjustmentLine> = {},
): RawTruecommerceStockAdjustmentLine {
  return {
    item_id: 'item_001',
    delta_qty: -10,
    counted_qty: 240,
    notes: 'Cycle count discrepancy',
    ...overrides,
  }
}

function makeRaw(
  overrides: Partial<RawTruecommerceStockAdjustment> = {},
): RawTruecommerceStockAdjustment {
  return {
    adjustment_id: 'adj_001',
    location_id: 'loc_001',
    reason: 'cycle count',
    status: 'complete',
    line_items: [makeLine()],
    adjustment_date: '2024-03-01T00:00:00Z',
    adjusted_by: 'Jane Doe',
    ...overrides,
  }
}

// ─── transformStockAdjustment ─────────────────────────────────────────────────

describe('transformStockAdjustment', () => {
  it('maps id and externalId from adjustment_id', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.id).toBe('adj_001')
    expect(result.externalId).toBe('adj_001')
  })

  it('maps locationId from location_id', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.locationId).toBe('loc_001')
  })

  it('defaults locationId to empty string when location_id is absent', () => {
    const result = transformStockAdjustment(makeRaw({ location_id: undefined }))
    expect(result.locationId).toBe('')
  })

  it('maps adjustedAt from adjustment_date as ISO string', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to epoch ISO when adjustment_date is absent', () => {
    const result = transformStockAdjustment(makeRaw({ adjustment_date: undefined }))
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('maps adjustedBy from adjusted_by', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('maps line items: productId, deltaQuantity, countedQuantity, notes', () => {
    const result = transformStockAdjustment(makeRaw())
    const line = result.lines[0]
    expect(line?.productId).toBe('item_001')
    expect(line?.deltaQuantity).toBe(-10)
    expect(line?.countedQuantity).toBe(240)
    expect(line?.notes).toBe('Cycle count discrepancy')
  })

  it('returns empty lines array when line_items is absent', () => {
    const result = transformStockAdjustment(makeRaw({ line_items: undefined }))
    expect(result.lines).toEqual([])
  })

  it('hardcodes platform to "truecommerce"', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.platform).toBe('truecommerce')
  })

  describe('mapReason', () => {
    const cases: [string, string][] = [
      ['cycle count', 'cycle_count'],
      ['physical count', 'cycle_count'],
      ['damage report', 'damage'],
      ['damaged goods', 'damage'],
      ['theft', 'theft'],
      ['steal', 'theft'],
      ['lost item', 'lost'],
      ['found item', 'found'],
      ['expiration', 'expiration'],
      ['expired product', 'expiration'],
      ['correction', 'correction'],
      ['data correction', 'correction'],
      ['miscellaneous', 'other'], // default fallback
    ]

    for (const [rawReason, expected] of cases) {
      it(`maps reason "${rawReason}" → "${expected}"`, () => {
        const result = transformStockAdjustment(makeRaw({ reason: rawReason }))
        expect(result.reason).toBe(expected)
      })
    }

    it('defaults to "other" when reason is absent', () => {
      const result = transformStockAdjustment(makeRaw({ reason: undefined }))
      expect(result.reason).toBe('other')
    })
  })

  it('puts raw reason and status in metadata', () => {
    const result = transformStockAdjustment(makeRaw({ reason: 'cycle count', status: 'complete' }))
    expect(result.metadata['rawReason']).toBe('cycle count')
    expect(result.metadata['status']).toBe('complete')
  })

  it('passes StockAdjustmentSchema.parse without throwing', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
