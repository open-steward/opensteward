import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawJubelioPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/jubelio/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — jubelio', () => {
  const raw: RawJubelioPurchaseOrder = {
    purchaseorder_id: 200,
    purchaseorder_no: 'PO-JB-200',
    vendor_id: 30,
    vendor_name: 'Supplier IDR',
    location_id: 5,
    status: 'ordered',
    currency: 'IDR',
    subtotal: 1000000,
    grand_total: 1050000,
    order_date: '2024-03-01T00:00:00Z',
    expected_date: '2024-04-01T00:00:00Z',
    // status is `ordered` — nothing received yet, so no receive_date on the PO.
    items: [
      {
        item_id: 100,
        qty: 10,
        qty_received: 0,
        unit_price: 100000,
        total: 1000000,
      },
    ],
  }
  const result = transformPurchaseOrder(raw)

  it('sets id from purchaseorder_id', () => {
    expect(result.id).toBe('200')
  })

  it('sets number from purchaseorder_no', () => {
    expect(result.number).toBe('PO-JB-200')
  })

  it('maps status ordered → sent', () => {
    expect(result.status).toBe('sent')
  })

  it('sets supplierId from vendor_id', () => {
    expect(result.supplierId).toBe('30')
  })

  it('sets destinationLocationId from location_id', () => {
    expect(result.destinationLocationId).toBe('5')
  })

  it('sets currency from currency', () => {
    expect(result.currency).toBe('IDR')
  })

  it('sets totalAmount from grand_total', () => {
    expect(result.totalAmount).toBe(1050000)
  })

  it('maps line productId from item_id', () => {
    expect(result.lines[0]?.productId).toBe('100')
  })

  it('maps line quantityOrdered from qty', () => {
    expect(result.lines[0]?.quantityOrdered).toBe(10)
  })

  it('sets platform to jubelio', () => {
    expect(result.platform).toBe('jubelio')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — status mapping', () => {
  const makeRaw = (status: string): RawJubelioPurchaseOrder => ({
    purchaseorder_id: 1,
    vendor_id: 1,
    status,
    items: [],
  })

  it('maps draft → draft', () => {
    expect(transformPurchaseOrder(makeRaw('draft')).status).toBe('draft')
  })

  it('maps partial → partially_received', () => {
    expect(transformPurchaseOrder(makeRaw('partial')).status).toBe('partially_received')
  })

  it('maps received → received', () => {
    expect(transformPurchaseOrder(makeRaw('received')).status).toBe('received')
  })

  it('maps completed → closed', () => {
    expect(transformPurchaseOrder(makeRaw('completed')).status).toBe('closed')
  })

  it('maps cancelled → cancelled', () => {
    expect(transformPurchaseOrder(makeRaw('cancelled')).status).toBe('cancelled')
  })
})
