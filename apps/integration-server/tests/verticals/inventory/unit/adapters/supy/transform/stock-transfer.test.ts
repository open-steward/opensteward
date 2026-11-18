import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawSupyTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/supy/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

function makeRaw(overrides: Partial<RawSupyTransfer> = {}): RawSupyTransfer {
  return {
    id: 'tr-44',
    transferNumber: 'TRN-44',
    fromBranchId: 'branch-1',
    toBranchId: 'branch-2',
    status: 'in_transit',
    lines: [
      {
        itemId: 'item-5',
        quantity: 30,
        receivedQuantity: undefined,
      },
    ],
    shippedAt: '2024-03-01T00:00:00Z',
    receivedAt: undefined,
    notes: 'Weekly replenishment',
    ...overrides,
  }
}

describe('transformStockTransfer (supy)', () => {
  it('maps id and externalId', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.id).toBe('tr-44')
    expect(result.externalId).toBe('tr-44')
  })

  it('maps number from transferNumber', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.number).toBe('TRN-44')
  })

  it('maps fromLocationId and toLocationId from branch IDs', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.fromLocationId).toBe('branch-1')
    expect(result.toLocationId).toBe('branch-2')
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

  it('maps status "pending" → "draft"', () => {
    const result = transformStockTransfer(makeRaw({ status: 'pending' }))
    expect(result.status).toBe('draft')
  })

  it('maps line items: productId and quantity', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-5')
    expect(result.lines[0]!.quantity).toBe(30)
  })

  it('maps shippedAt as ISO string', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is "supy"', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.platform).toBe('supy')
  })

  it('handles missing lines', () => {
    const result = transformStockTransfer(makeRaw({ lines: undefined }))
    expect(result.lines).toEqual([])
  })

  it('passes StockTransferSchema validation', () => {
    const result = transformStockTransfer(makeRaw())
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
