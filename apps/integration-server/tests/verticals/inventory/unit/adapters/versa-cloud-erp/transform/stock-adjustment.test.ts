import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawVersaStockAdjustment,
  type RawVersaAdjustmentLine,
} from '../../../../../../../src/verticals/inventory/adapters/versa-cloud-erp/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

const baseLines: RawVersaAdjustmentLine[] = [
  { item_id: 'item-001', delta_quantity: -5, counted_quantity: 245, notes: 'discrepancy found' },
]

const baseRaw: RawVersaStockAdjustment = {
  id: 'adj-001',
  location_id: 'loc-001',
  reason: 'cycle count',
  status: 'completed',
  adjusted_by: 'jdoe',
  adjustment_date: '2024-03-01T00:00:00Z',
  adjustment_lines: baseLines,
}

describe('versa-cloud-erp transformStockAdjustment', () => {
  it('maps id from id field', () => {
    expect(transformStockAdjustment(baseRaw).id).toBe('adj-001')
  })

  it('maps locationId from location_id', () => {
    expect(transformStockAdjustment(baseRaw).locationId).toBe('loc-001')
  })

  it('maps reason cycle_count from "cycle count" string', () => {
    expect(transformStockAdjustment(baseRaw).reason).toBe('cycle_count')
  })

  it('maps reason damage from "damage" keyword', () => {
    const result = transformStockAdjustment({ ...baseRaw, reason: 'damage to goods' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason theft from "theft" keyword', () => {
    const result = transformStockAdjustment({ ...baseRaw, reason: 'theft incident' })
    expect(result.reason).toBe('theft')
  })

  it('maps reason expiration from "expir" keyword', () => {
    const result = transformStockAdjustment({ ...baseRaw, reason: 'expired products' })
    expect(result.reason).toBe('expiration')
  })

  it('maps reason correction from "correct" keyword', () => {
    const result = transformStockAdjustment({ ...baseRaw, reason: 'correction entry' })
    expect(result.reason).toBe('correction')
  })

  it('maps lines from adjustment_lines with productId and deltaQuantity', () => {
    const result = transformStockAdjustment(baseRaw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-001')
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
  })

  it('maps countedQuantity from counted_quantity', () => {
    expect(transformStockAdjustment(baseRaw).lines[0]!.countedQuantity).toBe(245)
  })

  it('also accepts lines key instead of adjustment_lines', () => {
    const raw: RawVersaStockAdjustment = {
      ...baseRaw,
      adjustment_lines: undefined,
      lines: baseLines,
    }
    expect(transformStockAdjustment(raw).lines).toHaveLength(1)
  })

  it('maps adjustedAt from adjustment_date', () => {
    expect(transformStockAdjustment(baseRaw).adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to date field when adjustment_date absent', () => {
    const result = transformStockAdjustment({
      ...baseRaw,
      adjustment_date: undefined,
      date: '2024-03-01T00:00:00Z',
    })
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from adjusted_by', () => {
    expect(transformStockAdjustment(baseRaw).adjustedBy).toBe('jdoe')
  })

  it('sets platform to versa-cloud-erp', () => {
    expect(transformStockAdjustment(baseRaw).platform).toBe('versa-cloud-erp')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(baseRaw))).not.toThrow()
  })
})
