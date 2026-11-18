import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawStoreFeederStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/store-feeder/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer — store-feeder', () => {
  const raw: RawStoreFeederStockTransfer = {
    TransferID: 3001,
    TransferGUID: 'tr-guid-abc',
    FromStockLocationID: 201,
    ToStockLocationID: 202,
    Status: 'In Transit',
    Lines: [{ ProductID: 12345, Quantity: 50, QuantityReceived: 50 }],
    CreatedDate: '2024-03-01T00:00:00Z',
    CompletedDate: '2024-03-01T00:00:00Z',
  }
  const result = transformStockTransfer(raw)

  it('maps id from TransferID as string', () => {
    expect(result.id).toBe('3001')
  })

  it('maps number from TransferID string', () => {
    expect(result.number).toBe('3001')
  })

  it('maps fromLocationId from FromStockLocationID', () => {
    expect(result.fromLocationId).toBe('201')
  })

  it('maps toLocationId from ToStockLocationID', () => {
    expect(result.toLocationId).toBe('202')
  })

  it('maps status "In Transit" to in_transit', () => {
    expect(result.status).toBe('in_transit')
  })

  it('maps line productId from ProductID', () => {
    expect(result.lines[0]?.productId).toBe('12345')
  })

  it('maps line quantity', () => {
    expect(result.lines[0]?.quantity).toBe(50)
  })

  it('maps line quantityReceived', () => {
    expect(result.lines[0]?.quantityReceived).toBe(50)
  })

  it('maps shippedAt from CreatedDate', () => {
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from CompletedDate', () => {
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to store-feeder', () => {
    expect(result.platform).toBe('store-feeder')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — store-feeder status mapping', () => {
  const base: RawStoreFeederStockTransfer = {
    TransferID: 1,
    FromStockLocationID: 1,
    ToStockLocationID: 2,
  }

  it.each([
    ['draft', 'draft'],
    ['pending', 'draft'],
    ['intransit', 'in_transit'],
    ['shipped', 'in_transit'],
    ['completed', 'completed'],
    ['received', 'completed'],
    ['complete', 'completed'],
    ['cancelled', 'cancelled'],
    ['voided', 'cancelled'],
    ['unknown', 'draft'],
  ] as const)('maps status "%s" to "%s"', (status, expected) => {
    const result = transformStockTransfer({ ...base, Status: status })
    expect(result.status).toBe(expected)
  })
})

describe('transformStockTransfer — store-feeder WarehouseID fallback', () => {
  const raw: RawStoreFeederStockTransfer = {
    TransferGUID: 'TR-GUID-01',
    FromWarehouseID: 101,
    ToWarehouseID: 102,
    Status: 'Completed',
  }
  const result = transformStockTransfer(raw)

  it('falls back fromLocationId to FromWarehouseID', () => {
    expect(result.fromLocationId).toBe('101')
  })

  it('falls back toLocationId to ToWarehouseID', () => {
    expect(result.toLocationId).toBe('102')
  })

  it('uses TransferGUID as id when TransferID absent', () => {
    expect(result.id).toBe('TR-GUID-01')
  })
})
