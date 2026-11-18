import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawTecsysStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/tecsys/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

function makeRaw(overrides: Partial<RawTecsysStockTransfer> = {}): RawTecsysStockTransfer {
  return {
    TransferId: 'TXFR-001',
    TransferNumber: 'TN-001',
    SourceLocationInternalName: 'LOC-MAIN',
    DestinationLocationInternalName: 'LOC-STORE-1',
    Status: 'SHIPPED',
    ShippedDate: '2024-03-01T00:00:00Z',
    ReceivedDate: undefined,
    Lines: [
      {
        Sku: 'SKU-TECSYS-001',
        QuantityTransferred: 25,
        QuantityReceived: undefined,
      },
    ],
    ...overrides,
  }
}

describe('transformStockTransfer (tecsys)', () => {
  it('maps id and externalId from TransferId', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.id).toBe('TXFR-001')
    expect(result.externalId).toBe('TXFR-001')
  })

  it('maps number from TransferNumber', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.number).toBe('TN-001')
  })

  it('maps fromLocationId and toLocationId', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.fromLocationId).toBe('LOC-MAIN')
    expect(result.toLocationId).toBe('LOC-STORE-1')
  })

  it('maps status "SHIPPED" → "in_transit"', () => {
    const result = transformStockTransfer(makeRaw({ Status: 'SHIPPED' }))
    expect(result.status).toBe('in_transit')
  })

  it('maps status "IN TRANSIT" → "in_transit"', () => {
    const result = transformStockTransfer(makeRaw({ Status: 'IN TRANSIT' }))
    expect(result.status).toBe('in_transit')
  })

  it('maps status "RECEIVED" → "completed"', () => {
    const result = transformStockTransfer(makeRaw({ Status: 'RECEIVED' }))
    expect(result.status).toBe('completed')
  })

  it('maps status "CANCELLED" → "cancelled"', () => {
    const result = transformStockTransfer(makeRaw({ Status: 'CANCELLED' }))
    expect(result.status).toBe('cancelled')
  })

  it('maps status "DRAFT" → "draft"', () => {
    const result = transformStockTransfer(makeRaw({ Status: 'DRAFT' }))
    expect(result.status).toBe('draft')
  })

  it('maps line items: productId and quantity', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('SKU-TECSYS-001')
    expect(result.lines[0]!.quantity).toBe(25)
  })

  it('maps shippedAt as ISO string', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is "tecsys"', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.platform).toBe('tecsys')
  })

  it('handles missing Lines', () => {
    const result = transformStockTransfer(makeRaw({ Lines: undefined }))
    expect(result.lines).toEqual([])
  })

  it('passes StockTransferSchema validation', () => {
    const result = transformStockTransfer(makeRaw())
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
