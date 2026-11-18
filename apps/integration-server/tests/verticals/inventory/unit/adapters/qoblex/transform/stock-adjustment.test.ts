import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawQoblexAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/qoblex/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('qoblex transformStockAdjustment', () => {
  const raw: RawQoblexAdjustment = {
    id: 200,
    number: 'ADJ-200',
    created_at: '2024-03-01T00:00:00Z',
    reason: 'cycle count',
    status: 'posted',
    units: 5,
    total: 250,
    location: { id: 42, name: 'East Warehouse' },
    line_items: [
      {
        id: 1,
        product_variant: { id: 101, name: 'WK Black', sku: 'WK-2026-BLK' },
        quantity: 240,
        cost: 49.99,
        previous_quantity: 250,
      },
    ],
    comments: 'post-audit',
    author_id: 7,
  }

  it('stringifies numeric id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('200')
  })

  it('maps locationId from location.id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('42')
  })

  it('maps "cycle count" reason to cycle_count', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps "stocktake" reason to cycle_count', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'stocktake' })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason string variations', () => {
    expect(transformStockAdjustment({ ...raw, reason: 'damage' }).reason).toBe('damage')
    expect(transformStockAdjustment({ ...raw, reason: 'theft' }).reason).toBe('theft')
    expect(transformStockAdjustment({ ...raw, reason: 'lost stock' }).reason).toBe('lost')
    expect(transformStockAdjustment({ ...raw, reason: 'found items' }).reason).toBe('found')
    expect(transformStockAdjustment({ ...raw, reason: 'expiration' }).reason).toBe('expiration')
    expect(transformStockAdjustment({ ...raw, reason: 'error correction' }).reason).toBe(
      'correction',
    )
    expect(transformStockAdjustment({ ...raw, reason: 'promo giveaway' }).reason).toBe('other')
  })

  it('computes deltaQuantity as quantity - previous_quantity', () => {
    const result = transformStockAdjustment(raw)
    // 240 - 250 = -10
    expect(result.lines[0]!.deltaQuantity).toBe(-10)
    expect(result.lines[0]!.countedQuantity).toBe(240)
  })

  it('maps line productId from product_variant.id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]!.productId).toBe('101')
  })

  it('maps adjustedAt from created_at', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back adjustedAt to epoch when created_at is absent', () => {
    const result = transformStockAdjustment({ ...raw, created_at: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
