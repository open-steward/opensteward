import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawMarketmanStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/marketman/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('marketman transformStockTransfer', () => {
  const raw: RawMarketmanStockTransfer = {
    ID: 'transfer-001',
    BuyerFromName: 'Main Kitchen',
    BuyerFromGuid: 'from-guid-abc',
    BuyerToName: 'Bar Area',
    BuyerToGuid: 'to-guid-xyz',
    DateUTC: '2024-03-01T00:00:00Z',
    TotalPriceWithoutVAT: 200,
    TransferStatus: 'COMPLETED',
    Lines: [
      {
        LineID: 'line-1',
        ItemID: 'item-42',
        ItemName: 'Olive Oil',
        Quantity: 5,
        UOMName: 'litre',
      },
    ],
  }

  it('maps id and externalId from ID', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('transfer-001')
    expect(result.externalId).toBe('transfer-001')
  })

  it('maps fromLocationId from BuyerFromGuid', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('from-guid-abc')
  })

  it('maps toLocationId from BuyerToGuid', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('to-guid-xyz')
  })

  it('maps status COMPLETED to completed', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('completed')
  })

  it('maps status IN TRANSIT to in_transit', () => {
    const result = transformStockTransfer({ ...raw, TransferStatus: 'IN TRANSIT' })
    expect(result.status).toBe('in_transit')
  })

  it('maps line productId from ItemID', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0]?.productId).toBe('item-42')
  })

  it('maps line quantity', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0]?.quantity).toBe(5)
  })

  it('sets platform to marketman', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('marketman')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
