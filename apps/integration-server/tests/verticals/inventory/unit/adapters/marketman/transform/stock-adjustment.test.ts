import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawMarketmanStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/marketman/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

/** Run `fn` in a zone that is not UTC; vitest.config.ts pins TZ=UTC. */
function underTz<T>(tz: string, fn: () => T): T {
  const prev = process.env['TZ']
  process.env['TZ'] = tz
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env['TZ']
    else process.env['TZ'] = prev
  }
}

describe('marketman transformStockAdjustment', () => {
  const raw: RawMarketmanStockAdjustment = {
    ID: 'count-001',
    BuyerName: 'Main Restaurant',
    BuyerGuid: 'buyer-guid-abc',
    // The documented wire format, "yyyy/mm/dd hh:mm:ss", zoneless UTC.
    CountDateUTC: '2024/03/01 09:30:15',
    PriceTotalWithoutVAT: 500,
    Lines: [
      {
        LineID: 'line-1',
        ItemID: 'item-42',
        ItemName: 'Olive Oil',
        TotalCount: 10,
        TotalValue: 200,
      },
    ],
  }

  it('maps id and externalId from ID', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('count-001')
    expect(result.externalId).toBe('count-001')
  })

  it('maps locationId from BuyerGuid', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('buyer-guid-abc')
  })

  it('sets reason to cycle_count', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps line productId from ItemID', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]?.productId).toBe('item-42')
  })

  it('maps line deltaQuantity from TotalCount', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]?.deltaQuantity).toBe(10)
  })

  it('maps adjustedAt from the documented CountDateUTC', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T09:30:15.000Z')
  })

  it('reads CountDateUTC as UTC on a host that is not in UTC', () => {
    const east = underTz('Asia/Tokyo', () => transformStockAdjustment(raw).adjustedAt)
    const west = underTz('America/New_York', () => transformStockAdjustment(raw).adjustedAt)
    expect([east, west]).toEqual(['2024-03-01T09:30:15.000Z', '2024-03-01T09:30:15.000Z'])
  })

  it('sets platform to marketman', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('marketman')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
