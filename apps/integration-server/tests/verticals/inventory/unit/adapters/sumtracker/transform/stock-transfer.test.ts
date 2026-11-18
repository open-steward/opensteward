import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawSumtrackerStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/sumtracker/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

function makeRaw(overrides: Partial<RawSumtrackerStockTransfer> = {}): RawSumtrackerStockTransfer {
  return {
    id: 500,
    transfer_number: 'TR-500',
    from_warehouse_id: 1,
    to_warehouse_id: 2,
    status: 'in_transit',
    items: [
      {
        product_id: 'prod-3',
        quantity: 20,
        received_qty: 0,
      },
    ],
    transfer_date: '2024-03-01T00:00:00Z',
    received_date: undefined,
    ...overrides,
  }
}

describe('transformStockTransfer (sumtracker)', () => {
  it('maps id and externalId from numeric raw.id', () => {
    const result = transformStockTransfer(makeRaw({ id: 500 }))
    expect(result.id).toBe('500')
    expect(result.externalId).toBe('500')
  })

  it('maps number from transfer_number', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.number).toBe('TR-500')
  })

  it('maps fromLocationId and toLocationId', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.fromLocationId).toBe('1')
    expect(result.toLocationId).toBe('2')
  })

  it('maps status "in_transit" → "in_transit"', () => {
    const result = transformStockTransfer(makeRaw({ status: 'in_transit' }))
    expect(result.status).toBe('in_transit')
  })

  it('maps status "shipped" → "in_transit"', () => {
    const result = transformStockTransfer(makeRaw({ status: 'shipped' }))
    expect(result.status).toBe('in_transit')
  })

  it('maps status "completed" → "completed"', () => {
    const result = transformStockTransfer(makeRaw({ status: 'completed' }))
    expect(result.status).toBe('completed')
  })

  it('maps line items: productId and quantity', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-3')
    expect(result.lines[0]!.quantity).toBe(20)
  })

  it('maps shippedAt as ISO string', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is "sumtracker"', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.platform).toBe('sumtracker')
  })

  it('handles missing items', () => {
    const result = transformStockTransfer(makeRaw({ items: undefined }))
    expect(result.lines).toEqual([])
  })

  it('passes StockTransferSchema validation', () => {
    const result = transformStockTransfer(makeRaw())
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
