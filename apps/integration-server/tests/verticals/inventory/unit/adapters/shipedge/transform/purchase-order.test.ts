import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawShipEdgePurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/shipedge/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('shipedge transformPurchaseOrder', () => {
  const raw: RawShipEdgePurchaseOrder = {
    reple_id: 'REPLE-001',
    po_num: 'PO-2024-001',
    status: 'intransit',
    tracking_num: '1Z999AA10123456784',
    supplier_name: 'Acme Supplies',
    comments: 'Rush order',
    expected_delivery_date: '2024-04-01T00:00:00Z',
    items: [
      {
        sku: 'WKB-100',
        description: 'Ergonomic Keyboard',
        qty_request: 100,
        qty_received: 0,
        bin: 'A1',
        lpn: null,
        lot: null,
        expir: null,
        uom: null,
      },
    ],
  }

  it('maps reple_id to id and externalId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('REPLE-001')
    expect(result.externalId).toBe('REPLE-001')
  })

  it('maps po_num to number', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplier_name to supplierId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('Acme Supplies')
  })

  it('maps "intransit" status to "sent"', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps "new" status to "draft"', () => {
    const draft: RawShipEdgePurchaseOrder = { ...raw, status: 'new' }
    expect(transformPurchaseOrder(draft).status).toBe('draft')
  })

  it('maps "partial" status to "partially_received"', () => {
    const partial: RawShipEdgePurchaseOrder = { ...raw, status: 'partial' }
    expect(transformPurchaseOrder(partial).status).toBe('partially_received')
  })

  it('maps "received" status to "received"', () => {
    const received: RawShipEdgePurchaseOrder = { ...raw, status: 'received' }
    expect(transformPurchaseOrder(received).status).toBe('received')
  })

  it('maps "cancelled" status to "cancelled"', () => {
    const cancelled: RawShipEdgePurchaseOrder = { ...raw, status: 'cancelled' }
    expect(transformPurchaseOrder(cancelled).status).toBe('cancelled')
  })

  it('maps expected_delivery_date to expectedAt', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-04-01T00:00:00.000Z')
  })

  it('maps items to lines using sku as productId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('WKB-100')
    expect(result.lines[0].quantityOrdered).toBe(100)
  })

  it('satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw))).not.toThrow()
  })
})
