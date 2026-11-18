import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawSellercloudWITR,
} from '../../../../../../../src/verticals/inventory/adapters/sellercloud/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('sellercloud transformStockTransfer', () => {
  const raw: RawSellercloudWITR = {
    ID: 2001,
    Title: 'WITR-2001',
    Status: 3, // Shipped → in_transit
    FromWarehouseID: 10,
    ToWarehouseID: 20,
    Notes: 'Urgent transfer',
    CreatedOn: '2024-03-01T00:00:00Z',
    ShippedOn: '2024-03-02T00:00:00Z',
    ReceivedOn: '2024-03-10T00:00:00Z',
    Products: [
      {
        ProductID: 'SKU-A',
        TransferQty: 50,
        TotalReceivedQty: 50,
      },
    ],
  }

  it('maps ID to id and externalId as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('2001')
    expect(result.externalId).toBe('2001')
  })

  it('maps Title to number', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('WITR-2001')
  })

  it('maps Status 3 to "in_transit"', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps Status 15 to "completed"', () => {
    const completed: RawSellercloudWITR = { ...raw, Status: 15 }
    expect(transformStockTransfer(completed).status).toBe('completed')
  })

  it('maps Status 0 to "draft"', () => {
    const draft: RawSellercloudWITR = { ...raw, Status: 0 }
    expect(transformStockTransfer(draft).status).toBe('draft')
  })

  it('maps Status 20 to "cancelled"', () => {
    const cancelled: RawSellercloudWITR = { ...raw, Status: 20 }
    expect(transformStockTransfer(cancelled).status).toBe('cancelled')
  })

  it('maps Status 88 to "in_transit" (PartiallyReceived still in motion)', () => {
    const partial: RawSellercloudWITR = { ...raw, Status: 88 }
    expect(transformStockTransfer(partial).status).toBe('in_transit')
  })

  it('maps FromWarehouseID to fromLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('10')
  })

  it('maps ToWarehouseID to toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('20')
  })

  it('maps ShippedOn to shippedAt', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-02T00:00:00.000Z')
  })

  it('maps ReceivedOn to receivedAt', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-10T00:00:00.000Z')
  })

  it('maps Products to lines', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('SKU-A')
    expect(result.lines[0].quantity).toBe(50)
    expect(result.lines[0].quantityReceived).toBe(50)
  })

  it('satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(raw))).not.toThrow()
  })
})
