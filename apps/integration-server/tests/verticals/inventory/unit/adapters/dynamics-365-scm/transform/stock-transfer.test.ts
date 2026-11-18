import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawD365TransferOrder,
  type RawD365TransferOrderLine,
} from '../../../../../../../src/verticals/inventory/adapters/dynamics-365-scm/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('dynamics-365-scm transformStockTransfer', () => {
  const line: RawD365TransferOrderLine = {
    TransferOrderNumber: 'TO-001',
    LineNumber: 1,
    ItemNumber: 'ITEM-001',
    TransferQuantity: 50,
    RemainInventPhysical: 10,
    QtyTransferred: 40,
    QtyReceived: 40,
  }

  const raw: RawD365TransferOrder = {
    TransferOrderNumber: 'TO-001',
    TransferOrderStatus: 'Shipped',
    InventLocationIdFrom: 'WH-001',
    InventLocationIdTo: 'WH-002',
    ShipDate: '2024-03-01T00:00:00.000Z',
    ReceiveDate: '2024-03-01T00:00:00.000Z',
    RequestedShippingDate: '2024-03-01T00:00:00.000Z',
    DataAreaId: 'USMF',
    TransferOrderLines: [line],
  }

  it('maps id and externalId from TransferOrderNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('TO-001')
    expect(result.externalId).toBe('TO-001')
  })

  it('maps number from TransferOrderNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TO-001')
  })

  it('maps fromLocationId from InventLocationIdFrom', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('WH-001')
  })

  it('maps toLocationId from InventLocationIdTo', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('WH-002')
  })

  it('maps status Shipped to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status Open to draft', () => {
    const result = transformStockTransfer({ ...raw, TransferOrderStatus: 'Open' })
    expect(result.status).toBe('draft')
  })

  it('maps status Received to completed', () => {
    const result = transformStockTransfer({ ...raw, TransferOrderStatus: 'Received' })
    expect(result.status).toBe('completed')
  })

  it('maps status Annulled to cancelled', () => {
    const result = transformStockTransfer({ ...raw, TransferOrderStatus: 'Annulled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line productId from ItemNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0].productId).toBe('ITEM-001')
  })

  it('maps line quantity from TransferQuantity', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0].quantity).toBe(50)
  })

  it('maps line quantityReceived from QtyReceived', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0].quantityReceived).toBe(40)
  })

  it('maps shippedAt from ShipDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from ReceiveDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to dynamics-365-scm', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('dynamics-365-scm')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
