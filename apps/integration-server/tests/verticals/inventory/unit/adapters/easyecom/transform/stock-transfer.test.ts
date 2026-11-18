import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawEasyEcomStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/easyecom/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('easyecom transformStockTransfer', () => {
  const raw: RawEasyEcomStockTransfer = {
    transfer_id: 'TR-001',
    transfer_number: 'TRF-2024-001',
    from_warehouse_id: 42,
    to_warehouse_id: 99,
    status: 'IN TRANSIT',
    items: [
      {
        sku: 'SKU-001',
        product_id: 'PROD-001',
        qty_transferred: 20,
        qty_received: 20,
      },
    ],
    shipped_date: '2024-03-01T00:00:00.000Z',
    received_date: '2024-03-01T00:00:00.000Z',
  }

  it('maps id and externalId from transfer_id as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('TR-001')
    expect(result.externalId).toBe('TR-001')
  })

  it('maps number from transfer_number', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TRF-2024-001')
  })

  it('maps fromLocationId from from_warehouse_id as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('42')
  })

  it('maps toLocationId from to_warehouse_id as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('99')
  })

  it('maps status IN TRANSIT to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status DRAFT to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps status SHIPPED to in_transit', () => {
    const result = transformStockTransfer({ ...raw, status: 'SHIPPED' })
    expect(result.status).toBe('in_transit')
  })

  it('maps status COMPLETED to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'COMPLETED' })
    expect(result.status).toBe('completed')
  })

  it('maps status CANCELLED to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line productId from product_id as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0].productId).toBe('PROD-001')
  })

  it('maps line quantity from qty_transferred', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0].quantity).toBe(20)
  })

  it('maps line quantityReceived from qty_received', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0].quantityReceived).toBe(20)
  })

  it('maps shippedAt from shipped_date', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from received_date', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to easyecom', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('easyecom')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
