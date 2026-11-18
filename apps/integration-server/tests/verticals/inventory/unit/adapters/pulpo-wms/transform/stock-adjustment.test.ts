import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawPulpoWmsStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/pulpo-wms/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('pulpo-wms transformStockAdjustment', () => {
  const raw: RawPulpoWmsStockAdjustment = {
    id: 'adj-001',
    warehouse_id: 'wh-001',
    reason: 'cycle count',
    reason_code: 'CC',
    status: 'posted',
    lines: [
      {
        product_id: 'prod-001',
        delta_quantity: -10,
        counted_quantity: 240,
        notes: 'recount after audit',
      },
    ],
    adjusted_at: '2024-03-01T00:00:00Z',
    adjusted_by: 'jane.doe',
  }

  it('maps id and locationId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('adj-001')
    expect(result.locationId).toBe('wh-001')
  })

  it('maps reason from "cycle count" substring to cycle_count', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason substring variations', () => {
    expect(transformStockAdjustment({ ...raw, reason: 'damage to goods' }).reason).toBe('damage')
    expect(transformStockAdjustment({ ...raw, reason: 'theft incident' }).reason).toBe('theft')
    expect(transformStockAdjustment({ ...raw, reason: 'items lost' }).reason).toBe('lost')
    expect(transformStockAdjustment({ ...raw, reason: 'found in back' }).reason).toBe('found')
    expect(transformStockAdjustment({ ...raw, reason: 'expiration' }).reason).toBe('expiration')
    expect(transformStockAdjustment({ ...raw, reason: 'correction' }).reason).toBe('correction')
    expect(transformStockAdjustment({ ...raw, reason: 'unknown' }).reason).toBe('other')
  })

  it('uses reason_code when reason is absent', () => {
    const result = transformStockAdjustment({
      ...raw,
      reason: undefined,
      reason_code: 'cycle count code',
    })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps line items with deltaQuantity and countedQuantity', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-001')
    expect(result.lines[0]!.deltaQuantity).toBe(-10)
    expect(result.lines[0]!.countedQuantity).toBe(240)
    expect(result.lines[0]!.notes).toBe('recount after audit')
  })

  it('maps adjustedAt and adjustedBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.adjustedBy).toBe('jane.doe')
  })

  it('falls back adjustedAt to epoch when adjusted_at is absent', () => {
    const result = transformStockAdjustment({ ...raw, adjusted_at: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
