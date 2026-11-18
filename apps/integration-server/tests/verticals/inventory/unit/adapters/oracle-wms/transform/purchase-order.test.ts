import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawOracleWmsPurchaseOrderHdr,
} from '../../../../../../../src/verticals/inventory/adapters/oracle-wms/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('oracle-wms transformPurchaseOrder', () => {
  const raw: RawOracleWmsPurchaseOrderHdr = {
    po_hdr_id: 9001,
    po_num: 'PO-9001',
    vendor_id: 99,
    facility_id: 2,
    status: 'Open',
    currency: 'USD',
    expected_date: '2024-03-01T00:00:00Z',
    creation_date: '2024-03-01T00:00:00Z',
    purchase_order_dtl_set: [
      {
        po_dtl_id: 1,
        item_id: 5001,
        qty_ordered: 200,
        qty_received: 100,
        unit_price: 49.99,
        line_price: 9998,
      },
    ],
  }

  it('maps id and externalId from po_hdr_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('9001')
    expect(result.externalId).toBe('9001')
  })

  it('maps number from po_num', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-9001')
  })

  it('maps supplierId from vendor_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('99')
  })

  it('maps destinationLocationId from facility_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('2')
  })

  it('maps Open status to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps Closed status to closed', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'Closed' })
    expect(result.status).toBe('closed')
  })

  it('maps Cancelled status to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'Cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps Partially Received status to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'Partially Received' })
    expect(result.status).toBe('partially_received')
  })

  it('maps currency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps line items', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('5001')
    expect(result.lines[0]!.quantityOrdered).toBe(200)
    expect(result.lines[0]!.quantityReceived).toBe(100)
  })

  it('converts unit_price to minor units (cents)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0]!.unitCost).toBe(4999)
  })

  it('maps expectedAt from expected_date', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps orderedAt from creation_date', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to oracle-wms', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('oracle-wms')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
