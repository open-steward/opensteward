import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawEccangPurchaseOrder,
  type RawEccangPurchaseOrderLine,
} from '../../../../../../../src/verticals/inventory/adapters/eccang/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('eccang transformPurchaseOrder', () => {
  const line: RawEccangPurchaseOrderLine = {
    goods_id: 2001,
    sku_id: 3001,
    goods_no: 'GN-2001',
    purchase_qty: 50,
    received_qty: 20,
    purchase_price: 150,
    line_total: 7500,
  }

  const raw: RawEccangPurchaseOrder = {
    purchase_order_id: 5001,
    purchase_order_no: 'PO-5001',
    supplier_id: 9001,
    supplier_code: 'SUP-CODE-1',
    warehouse_id: 101,
    warehouse_code: 'SZ-MAIN',
    status: '1',
    currency: 'CNY',
    total_amount: 7500,
    sub_total: 7000,
    order_date: '2024-03-01T00:00:00.000Z',
    expected_date: '2024-03-01T00:00:00.000Z',
    finish_date: '2024-03-01T00:00:00.000Z',
    items: [line],
  }

  it('maps id and externalId from purchase_order_id as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('5001')
    expect(result.externalId).toBe('5001')
  })

  it('maps number from purchase_order_no', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-5001')
  })

  it('maps supplierId from supplier_id as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('9001')
  })

  it('maps destinationLocationId from warehouse_id as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('101')
  })

  it('maps status "1" to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status "0" to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: '0' })
    expect(result.status).toBe('draft')
  })

  it('maps status "draft" to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('maps status "partial" to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'partial' })
    expect(result.status).toBe('partially_received')
  })

  it('maps status "3" to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: '3' })
    expect(result.status).toBe('received')
  })

  it('maps status "4" to closed', () => {
    const result = transformPurchaseOrder({ ...raw, status: '4' })
    expect(result.status).toBe('closed')
  })

  it('maps status "5" to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: '5' })
    expect(result.status).toBe('cancelled')
  })

  it('maps totalAmount directly (no minor unit conversion)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(7500)
  })

  it('maps subtotalAmount directly (no minor unit conversion)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(7000)
  })

  it('maps currency from currency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('CNY')
  })

  it('maps line productId from sku_id as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].productId).toBe('3001')
  })

  it('maps line quantityOrdered from purchase_qty', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].quantityOrdered).toBe(50)
  })

  it('maps line quantityReceived from received_qty', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].quantityReceived).toBe(20)
  })

  it('maps expectedAt from expected_date', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps orderedAt from order_date', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from finish_date', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to eccang', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('eccang')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
