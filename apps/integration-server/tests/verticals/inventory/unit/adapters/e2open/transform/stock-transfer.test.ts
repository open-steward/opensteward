import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawE2openStockTransfer,
  type RawE2openStockTransferLine,
} from '../../../../../../../src/verticals/inventory/adapters/e2open/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('e2open transformStockTransfer', () => {
  const line: RawE2openStockTransferLine = {
    itemId: 'ITEM-001',
    shippedQty: 50,
    receivedQty: 50,
  }

  const raw: RawE2openStockTransfer = {
    shipmentId: 'SHIP-001',
    shipmentNumber: 'SHP-2024-001',
    fromLocationId: 'LOC-001',
    toLocationId: 'LOC-002',
    status: 'IN_TRANSIT',
    lines: [line],
    shipDate: '2024-03-01T00:00:00.000Z',
    receiptDate: '2024-03-01T00:00:00.000Z',
  }

  it('maps id and externalId from shipmentId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('SHIP-001')
    expect(result.externalId).toBe('SHIP-001')
  })

  it('falls back to shipmentNumber for id when shipmentId absent', () => {
    const result = transformStockTransfer({ ...raw, shipmentId: undefined })
    expect(result.id).toBe('SHP-2024-001')
  })

  it('maps number from shipmentNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('SHP-2024-001')
  })

  it('maps fromLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('LOC-001')
  })

  it('maps toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('LOC-002')
  })

  it('maps status IN_TRANSIT to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status DRAFT to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps status COMPLETED to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'COMPLETED' })
    expect(result.status).toBe('completed')
  })

  it('maps status CANCELLED to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps status SHIPPED to in_transit', () => {
    const result = transformStockTransfer({ ...raw, status: 'SHIPPED' })
    expect(result.status).toBe('in_transit')
  })

  it('maps line productId from itemId', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0].productId).toBe('ITEM-001')
  })

  it('maps line quantity from shippedQty', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0].quantity).toBe(50)
  })

  it('maps line quantityReceived from receivedQty', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0].quantityReceived).toBe(50)
  })

  it('maps shippedAt from shipDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from receiptDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to e2open', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('e2open')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
