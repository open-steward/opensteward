import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawLightspeedStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/lightspeed-inventory/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('lightspeed-inventory transformStockAdjustment', () => {
  const raw: RawLightspeedStockAdjustment = {
    id: 'con-stocktake-001',
    name: 'Cycle Count March',
    type: 'STOCKTAKE',
    status: 'RECEIVED',
    outlet_id: 'outlet-xyz',
    received_at: '2024-03-01T00:00:00Z',
    products: [{ product_id: 'prod-1', count: 5, received: 7 }],
    version: 1,
  }

  it('maps id and externalId from id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('con-stocktake-001')
    expect(result.externalId).toBe('con-stocktake-001')
  })

  it('maps locationId from outlet_id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('outlet-xyz')
  })

  it('maps reason from name containing "count"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason to damage when name includes damage', () => {
    const result = transformStockAdjustment({ ...raw, name: 'Damage write-off' })
    expect(result.reason).toBe('damage')
  })

  it('always sets deltaQuantity to 0 (X-Series stocktake uses counted amounts)', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].deltaQuantity).toBe(0)
  })

  it('maps countedQuantity from received field when present', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].countedQuantity).toBe(7)
  })

  it('maps countedQuantity from count when received is absent', () => {
    const result = transformStockAdjustment({
      ...raw,
      products: [{ product_id: 'prod-1', count: 5 }],
    })
    expect(result.lines[0].countedQuantity).toBe(5)
  })

  it('maps adjustedAt from received_at', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to lightspeed-inventory', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('lightspeed-inventory')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(raw))).not.toThrow()
  })
})
