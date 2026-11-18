import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawJushuitanPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/jushuitan/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('jushuitan transformPurchaseOrder', () => {
  const raw: RawJushuitanPurchaseOrder = {
    po_id: 500,
    po_code: 'PO-2024-001',
    supplier_id: 7,
    wms_co_id: 42,
    status: 1,
    currency: 'CNY',
    total_amount: 59980,
    items: [
      {
        sku_id: 1001,
        i_id: 'SKU-ABC',
        qty: 20,
        qty_in: 10,
        price: 2999,
        total: 59980,
      },
    ],
    created: '2024-03-01T00:00:00Z',
    expect_in_date: '2024-03-15T00:00:00Z',
    in_date: '2024-03-14T00:00:00Z',
  }

  it('maps id from po_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('500')
    expect(result.externalId).toBe('500')
  })

  it('maps number from po_code', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from supplier_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('7')
  })

  it('maps destinationLocationId from wms_co_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('42')
  })

  it('maps status=1 to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status=-1 to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: -1 })
    expect(result.status).toBe('cancelled')
  })

  it('maps status=2 to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 2 })
    expect(result.status).toBe('partially_received')
  })

  it('maps currency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('CNY')
  })

  it('defaults currency to CNY when missing', () => {
    const result = transformPurchaseOrder({ ...raw, currency: undefined })
    expect(result.currency).toBe('CNY')
  })

  it('maps totalAmount in minor units (fen)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(59980)
  })

  it('maps line items correctly', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('1001')
    expect(result.lines[0].quantityOrdered).toBe(20)
    expect(result.lines[0].quantityReceived).toBe(10)
    expect(result.lines[0].unitCost).toBe(2999)
    expect(result.lines[0].lineTotal).toBe(59980)
  })

  it('maps orderedAt, expectedAt, receivedAt', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-14T00:00:00.000Z')
  })

  it('sets platform to jushuitan', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('jushuitan')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw))).not.toThrow()
  })
})
