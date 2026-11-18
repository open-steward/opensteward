import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawKinaxisInventoryAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/kinaxis/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('kinaxis transformStockAdjustment', () => {
  const raw: RawKinaxisInventoryAdjustment = {
    id: 'adj-uuid-001',
    siteId: 'site-uuid-001',
    reason: 'CycleCount',
    status: 'Posted',
    lines: [
      {
        partId: 'part-uuid-001',
        deltaQty: -3,
        countedQty: 97,
        notes: 'Recount discrepancy',
      },
    ],
    adjustmentDate: '2024-03-01T00:00:00Z',
    adjustedBy: 'warehouse.manager',
  }

  it('maps id from raw.id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('adj-uuid-001')
    expect(result.externalId).toBe('adj-uuid-001')
  })

  it('maps locationId from siteId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('site-uuid-001')
  })

  it('maps reason cycle_count from "CycleCount"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason damage from keyword', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'Damage' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason correction from "WriteOff"', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'WriteOff' })
    expect(result.reason).toBe('correction')
  })

  it('defaults reason to other for unknown value', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'unknown' })
    expect(result.reason).toBe('other')
  })

  it('maps line items', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('part-uuid-001')
    expect(result.lines[0].deltaQuantity).toBe(-3)
    expect(result.lines[0].countedQuantity).toBe(97)
    expect(result.lines[0].notes).toBe('Recount discrepancy')
  })

  it('maps adjustedAt from adjustmentDate', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to epoch when adjustmentDate is missing', () => {
    const result = transformStockAdjustment({ ...raw, adjustmentDate: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('maps adjustedBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('warehouse.manager')
  })

  it('sets platform to kinaxis', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('kinaxis')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(raw))).not.toThrow()
  })
})
