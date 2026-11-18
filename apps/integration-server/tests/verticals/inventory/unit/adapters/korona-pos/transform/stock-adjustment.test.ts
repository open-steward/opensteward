import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawKoronaStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/korona-pos/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('korona-pos transformStockAdjustment', () => {
  const raw: RawKoronaStockAdjustment = {
    id: 'adj-uuid-001',
    number: 'ADJ-001',
    active: true,
    status: 'BOOKED',
    warehouse: { id: 'wh-uuid-001', number: 'WH-001' },
    reason: 'inventory count',
    bookingTime: '2024-03-01T00:00:00Z',
    bookingUser: { id: 'user-001', number: 'john.doe' },
    items: [
      {
        amount: -3,
        product: { id: 'prod-uuid-001', number: 'SKU-001' },
        reason: { type: 'BREAKAGE', comment: 'Dropped during stocking' },
      },
    ],
  }

  it('maps id from raw.id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('adj-uuid-001')
    expect(result.externalId).toBe('adj-uuid-001')
  })

  it('maps locationId from warehouse.id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('wh-uuid-001')
  })

  it('maps reason from doc-level reason string containing "inventory"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('uses item reason when doc reason is absent', () => {
    const result = transformStockAdjustment({ ...raw, reason: undefined })
    expect(result.reason).toBe('damage')
  })

  it('maps item reason THEFT to theft', () => {
    const result = transformStockAdjustment({
      ...raw,
      reason: undefined,
      items: [{ amount: -1, product: { id: 'p1' }, reason: { type: 'THEFT', comment: '' } }],
    })
    expect(result.reason).toBe('theft')
  })

  it('maps item reason EXPIRED_SHELF_LIFE to expiration', () => {
    const result = transformStockAdjustment({
      ...raw,
      reason: undefined,
      items: [{ amount: -2, product: { id: 'p1' }, reason: { type: 'EXPIRED_SHELF_LIFE' } }],
    })
    expect(result.reason).toBe('expiration')
  })

  it('defaults to other when no reason available', () => {
    const result = transformStockAdjustment({
      ...raw,
      reason: undefined,
      items: [],
    })
    expect(result.reason).toBe('other')
  })

  it('maps line item deltaQuantity from amount', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('prod-uuid-001')
    expect(result.lines[0].deltaQuantity).toBe(-3)
    expect(result.lines[0].notes).toBe('Dropped during stocking')
  })

  it('maps adjustedAt from bookingTime', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to finishTime when bookingTime is missing', () => {
    const result = transformStockAdjustment({
      ...raw,
      bookingTime: undefined,
      finishTime: '2024-03-02T00:00:00Z',
    })
    expect(result.adjustedAt).toBe('2024-03-02T00:00:00.000Z')
  })

  it('maps adjustedBy from bookingUser.number', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('john.doe')
  })

  it('sets platform to korona-pos', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('korona-pos')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(raw))).not.toThrow()
  })
})
