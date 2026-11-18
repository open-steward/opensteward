import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawInforWmsTransferOrder,
} from '../../../../../../../src/verticals/inventory/adapters/infor-wms/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('infor-wms transformStockTransfer', () => {
  const raw: RawInforWmsTransferOrder = {
    transferOrderId: 'TO-WMS-001',
    transferOrderNumber: 'TO-2024-001',
    fromWarehouseId: 'WH-001',
    toWarehouseId: 'WH-002',
    status: 'IN_TRANSIT',
    shippedDate: '2024-03-01T00:00:00Z',
    receivedDate: '2024-03-05T00:00:00Z',
    ownerCode: 'CORP',
    lines: [{ itemNumber: 'ITEM-001', transferredQty: 50, receivedQty: 50 }],
  }

  it('maps id and externalId from transferOrderId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('TO-WMS-001')
    expect(result.externalId).toBe('TO-WMS-001')
  })

  it('maps number from transferOrderNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TO-2024-001')
  })

  it('maps fromLocationId and toLocationId from warehouse ids', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('WH-001')
    expect(result.toLocationId).toBe('WH-002')
  })

  it('maps IN_TRANSIT status to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps RECEIVED status to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'RECEIVED' })
    expect(result.status).toBe('completed')
  })

  it('maps CLOSED status to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'CLOSED' })
    expect(result.status).toBe('completed')
  })

  it('maps lines with quantity from transferredQty', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('ITEM-001')
    expect(result.lines[0]!.quantity).toBe(50)
    expect(result.lines[0]!.quantityReceived).toBe(50)
  })

  it('maps shippedAt and receivedAt', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform to infor-wms', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('infor-wms')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
