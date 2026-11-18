import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawEccangStockTransfer,
  type RawEccangStockTransferLine,
} from '../../../../../../../src/verticals/inventory/adapters/eccang/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('eccang transformStockTransfer', () => {
  const line: RawEccangStockTransferLine = {
    goods_id: 2001,
    sku_id: 3001,
    transfer_qty: 30,
    received_qty: 30,
  }

  const raw: RawEccangStockTransfer = {
    transfer_order_id: 7001,
    transfer_order_no: 'TO-7001',
    from_warehouse_id: 101,
    from_warehouse_code: 'SZ-MAIN',
    to_warehouse_id: 202,
    to_warehouse_code: 'BJ-MAIN',
    status: '1',
    ship_time: '2024-03-01T00:00:00.000Z',
    finish_time: '2024-03-01T00:00:00.000Z',
    items: [line],
  }

  it('maps id and externalId from transfer_order_id as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('7001')
    expect(result.externalId).toBe('7001')
  })

  it('maps number from transfer_order_no', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TO-7001')
  })

  it('maps fromLocationId from from_warehouse_id as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('101')
  })

  it('falls back to from_warehouse_code for fromLocationId when from_warehouse_id absent', () => {
    const result = transformStockTransfer({ ...raw, from_warehouse_id: undefined })
    expect(result.fromLocationId).toBe('SZ-MAIN')
  })

  it('maps toLocationId from to_warehouse_id as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('202')
  })

  it('maps status "1" to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status "0" to draft', () => {
    const result = transformStockTransfer({ ...raw, status: '0' })
    expect(result.status).toBe('draft')
  })

  it('maps status "draft" to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('maps status "in_transit" to in_transit', () => {
    const result = transformStockTransfer({ ...raw, status: 'in_transit' })
    expect(result.status).toBe('in_transit')
  })

  it('maps status "2" to completed', () => {
    const result = transformStockTransfer({ ...raw, status: '2' })
    expect(result.status).toBe('completed')
  })

  it('maps status "3" to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: '3' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line productId from sku_id as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0].productId).toBe('3001')
  })

  it('maps line quantity from transfer_qty', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0].quantity).toBe(30)
  })

  it('maps line quantityReceived from received_qty', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0].quantityReceived).toBe(30)
  })

  it('maps shippedAt from ship_time', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from finish_time', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('stores warehouse codes in metadata', () => {
    const result = transformStockTransfer(raw)
    expect(result.metadata.fromWarehouseCode).toBe('SZ-MAIN')
    expect(result.metadata.toWarehouseCode).toBe('BJ-MAIN')
  })

  it('sets platform to eccang', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('eccang')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
