import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawMintsoftWarehouseTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/mintsoft/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('mintsoft transformStockTransfer', () => {
  const raw: RawMintsoftWarehouseTransfer = {
    ID: 300,
    SourceWarehouseId: 7,
    DestinationWarehouseId: 8,
    Reference: 'TRF-001',
    WarehouseTransferStatus: 'Dispatched',
    LastUpdated: '2024-03-01T00:00:00Z',
    ClientId: 10,
    Comments: 'Urgent transfer',
    Items: [
      {
        ProductId: 123,
        SKU: 'SKU-ABC',
        Quantity: 5,
        Complete: false,
      },
    ],
  }

  it('maps id and externalId from ID as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('300')
    expect(result.externalId).toBe('300')
  })

  it('maps number from Reference', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TRF-001')
  })

  it('maps fromLocationId from SourceWarehouseId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('7')
  })

  it('maps toLocationId from DestinationWarehouseId', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('8')
  })

  it('maps status dispatched to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status completed to completed', () => {
    const result = transformStockTransfer({ ...raw, WarehouseTransferStatus: 'Completed' })
    expect(result.status).toBe('completed')
  })

  it('maps line productId from ProductId', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0]?.productId).toBe('123')
  })

  it('maps line quantity', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0]?.quantity).toBe(5)
  })

  it('sets platform to mintsoft', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('mintsoft')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
