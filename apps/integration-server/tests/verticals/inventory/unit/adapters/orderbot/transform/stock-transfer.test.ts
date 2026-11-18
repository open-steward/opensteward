import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawOrderbotStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/orderbot/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer — orderbot', () => {
  const raw: RawOrderbotStockTransfer = {
    id: 88,
    number: 'TR-2024-088',
    from_location_id: 3,
    to_location_id: 7,
    status: 'in_transit',
    lines: [
      {
        product_id: 123,
        quantity: 50,
        quantity_received: 0,
      },
    ],
    shipped_at: '2024-03-01T00:00:00Z',
    received_at: '2024-03-01T00:00:00Z',
  }
  const result = transformStockTransfer(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('88')
  })

  it('maps number from raw.number', () => {
    expect(result.number).toBe('TR-2024-088')
  })

  it('maps fromLocationId from from_location_id as string', () => {
    expect(result.fromLocationId).toBe('3')
  })

  it('maps toLocationId from to_location_id as string', () => {
    expect(result.toLocationId).toBe('7')
  })

  it('maps status in_transit', () => {
    expect(result.status).toBe('in_transit')
  })

  it('maps lines with productId and quantity', () => {
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('123')
    expect(result.lines[0]!.quantity).toBe(50)
  })

  it('maps shippedAt via toIso', () => {
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to orderbot', () => {
    expect(result.platform).toBe('orderbot')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — orderbot status mapping', () => {
  const cases: Array<[string, string]> = [
    ['draft', 'draft'],
    ['shipped', 'in_transit'],
    ['intransit', 'in_transit'],
    ['completed', 'completed'],
    ['received', 'completed'],
    ['cancelled', 'cancelled'],
  ]

  for (const [input, expected] of cases) {
    it(`maps status "${input}" → "${expected}"`, () => {
      const raw: RawOrderbotStockTransfer = {
        id: 1,
        from_location_id: 1,
        to_location_id: 2,
        status: input,
        lines: [],
      }
      const result = transformStockTransfer(raw)
      expect(result.status).toBe(expected)
    })
  }
})

describe('transformStockTransfer — orderbot DC fallbacks', () => {
  const raw: RawOrderbotStockTransfer = {
    id: 99,
    transfer_number: 'TR-BACKUP',
    from_distribution_center_id: 11,
    to_distribution_center_id: 22,
    status: 'completed',
    line_items: [{ sku: 'SKU-A', quantity: 5 }],
    ship_date: '2024-03-01T00:00:00Z',
    completed_at: '2024-03-01T00:00:00Z',
  }
  const result = transformStockTransfer(raw)

  it('falls back to from_distribution_center_id for fromLocationId', () => {
    expect(result.fromLocationId).toBe('11')
  })

  it('falls back to to_distribution_center_id for toLocationId', () => {
    expect(result.toLocationId).toBe('22')
  })

  it('falls back to line_items when lines absent', () => {
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('SKU-A')
  })

  it('falls back to transfer_number for number', () => {
    expect(result.number).toBe('TR-BACKUP')
  })

  it('falls back to ship_date for shippedAt', () => {
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to completed_at for receivedAt', () => {
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
