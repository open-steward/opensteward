import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawMarketmanStockLevelLine,
} from '../../../../../../../src/verticals/inventory/adapters/marketman/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

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

describe('marketman transformStockLevel', () => {
  const raw: RawMarketmanStockLevelLine = {
    CountID: 'count-001',
    ItemID: 'item-42',
    ItemName: 'Olive Oil',
    TotalCount: 15,
    TotalValue: 300,
    BuyerGuid: 'buyer-guid-abc',
    // The documented wire format, "yyyy/mm/dd hh:mm:ss", zoneless UTC.
    CountDateUTC: '2024/03/01 09:30:15',
  }

  it('maps productId from ItemID', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('item-42')
  })

  it('maps locationId from BuyerGuid', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('buyer-guid-abc')
  })

  it('constructs id from productId:locationId:countId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('item-42:buyer-guid-abc:count-001')
  })

  it('maps quantityOnHand from TotalCount', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(15)
  })

  it('maps lastCountedAt from CountDateUTC', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T09:30:15.000Z')
  })

  it('reads CountDateUTC as UTC on a host that is not in UTC', () => {
    const east = underTz('Asia/Tokyo', () => transformStockLevel(raw).lastCountedAt)
    const west = underTz('America/New_York', () => transformStockLevel(raw).lastCountedAt)
    expect([east, west]).toEqual(['2024-03-01T09:30:15.000Z', '2024-03-01T09:30:15.000Z'])
  })

  it('sets platform to marketman', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('marketman')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
