import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawDeckCommerceStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/deck-commerce/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('deck-commerce transformStockTransfer', () => {
  const raw: RawDeckCommerceStockTransfer = {
    TransferID: 'dc-tr-001',
    TransferNumber: 'TR-DC-001',
    FromWarehouseCode: 'WH1',
    ToWarehouseCode: 'WH2',
    Status: 'IN TRANSIT',
    Lines: [{ SKU: 'DC-SKU-001', Qty: 25, ReceivedQty: 0 }],
    ShipDateUTC: '2024-03-01T00:00:00Z',
    ReceivedDateUTC: '2024-03-05T00:00:00Z',
  }

  it('maps id and externalId from TransferID', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('dc-tr-001')
    expect(result.externalId).toBe('dc-tr-001')
  })

  it('maps number from TransferNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TR-DC-001')
  })

  it('maps fromLocationId from FromWarehouseCode', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('WH1')
  })

  it('maps toLocationId from ToWarehouseCode', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('WH2')
  })

  it('maps status "IN TRANSIT" to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status DRAFT to draft', () => {
    const result = transformStockTransfer({ ...raw, Status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps status COMPLETED to completed', () => {
    const result = transformStockTransfer({ ...raw, Status: 'COMPLETED' })
    expect(result.status).toBe('completed')
  })

  it('maps status CANCELLED to cancelled', () => {
    const result = transformStockTransfer({ ...raw, Status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps lines correctly', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('DC-SKU-001')
    expect(result.lines[0].quantity).toBe(25)
    expect(result.lines[0].quantityReceived).toBe(0)
  })

  it('maps shippedAt from ShipDateUTC', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from ReceivedDateUTC', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform to deck-commerce', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('deck-commerce')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
