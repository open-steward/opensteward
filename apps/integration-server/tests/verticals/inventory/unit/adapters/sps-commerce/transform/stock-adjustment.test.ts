import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSpsCommerceStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/sps-commerce/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — sps-commerce', () => {
  const raw: RawSpsCommerceStockAdjustment = {
    adjustment_id: 'ADJ-SPS-01',
    location_id: 'LOC-001',
    reason: 'cycle count',
    adjusted_at: '2024-03-01T00:00:00Z',
    adjusted_by: 'Jane Doe',
    lines: [
      {
        item_id: 'SPS-ITEM-01',
        quantity_change: -10,
        quantity_on_hand: 240,
        notes: 'variance found',
      },
    ],
  }
  const result = transformStockAdjustment(raw)

  it('maps id from adjustment_id', () => {
    expect(result.id).toBe('ADJ-SPS-01')
  })

  it('maps locationId from location_id', () => {
    expect(result.locationId).toBe('LOC-001')
  })

  it('maps reason "cycle count" to cycle_count', () => {
    expect(result.reason).toBe('cycle_count')
  })

  it('maps line productId from item_id', () => {
    expect(result.lines[0]?.productId).toBe('SPS-ITEM-01')
  })

  it('maps line deltaQuantity from quantity_change', () => {
    expect(result.lines[0]?.deltaQuantity).toBe(-10)
  })

  it('maps line countedQuantity from quantity_on_hand', () => {
    expect(result.lines[0]?.countedQuantity).toBe(240)
  })

  it('maps adjustedAt from adjusted_at', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from adjusted_by', () => {
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('sets platform to sps-commerce', () => {
    expect(result.platform).toBe('sps-commerce')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — sps-commerce location fallback', () => {
  const raw: RawSpsCommerceStockAdjustment = {
    adjustment_id: 'ADJ-FB',
    location: 'WH-MAIN',
    reason: 'damage',
    adjusted_at: '2024-03-01T00:00:00Z',
  }
  const result = transformStockAdjustment(raw)

  it('falls back locationId to location string when location_id absent', () => {
    expect(result.locationId).toBe('WH-MAIN')
  })

  it('maps reason damage to damage', () => {
    expect(result.reason).toBe('damage')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
