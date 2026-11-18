import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawEasyEcomPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/easyecom/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('easyecom transformPurchaseOrder', () => {
  const raw: RawEasyEcomPurchaseOrder = {
    purchase_order_id: 'GRN-001',
    po_number: 'PO-2024-001',
    vendor_id: 'VEN-001',
    vendor_name: 'Textile Supplier Co',
    status: 'CONFIRMED',
    currency: 'INR',
    total_amount: 5990,
    sub_total: 5500,
    warehouse_id: 42,
    items: [
      {
        sku: 'SKU-001',
        product_id: 'PROD-001',
        qty_ordered: 10,
        qty_received: 5,
        unit_price: 599,
        total_price: 5990,
      },
    ],
    order_date: '2024-03-01T00:00:00.000Z',
    expected_delivery_date: '2024-03-01T00:00:00.000Z',
    received_date: '2024-03-01T00:00:00.000Z',
  }

  it('maps id and externalId from purchase_order_id as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('GRN-001')
    expect(result.externalId).toBe('GRN-001')
  })

  it('maps number from po_number', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from vendor_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('VEN-001')
  })

  it('maps destinationLocationId from warehouse_id as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('42')
  })

  it('maps status CONFIRMED to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status PENDING to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'PENDING' })
    expect(result.status).toBe('draft')
  })

  it('maps status PARTIALLY RECEIVED to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'PARTIALLY RECEIVED' })
    expect(result.status).toBe('partially_received')
  })

  it('maps status RECEIVED to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'RECEIVED' })
    expect(result.status).toBe('received')
  })

  it('maps status CLOSED to closed', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'CLOSED' })
    expect(result.status).toBe('closed')
  })

  it('converts total_amount to minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(599000)
  })

  it('converts sub_total to minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(550000)
  })

  it('maps currency from currency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('INR')
  })

  it('maps line productId from product_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].productId).toBe('PROD-001')
  })

  it('maps line quantityOrdered from qty_ordered', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].quantityOrdered).toBe(10)
  })

  it('maps line quantityReceived from qty_received', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].quantityReceived).toBe(5)
  })

  it('converts line unit_price to minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].unitCost).toBe(59900)
  })

  it('maps expectedAt from expected_delivery_date', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps orderedAt from order_date', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from received_date', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to easyecom', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('easyecom')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
