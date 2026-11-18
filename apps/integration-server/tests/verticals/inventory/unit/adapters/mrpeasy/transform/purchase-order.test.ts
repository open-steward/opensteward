import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawMrpeasyPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/mrpeasy/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('mrpeasy transformPurchaseOrder', () => {
  // MRPeasy dates are Unix timestamps; 1709251200 = 2024-03-01T00:00:00Z
  const raw: RawMrpeasyPurchaseOrder = {
    pur_ord_id: 500,
    code: 'PO-2024-001',
    vendor_id: 77,
    vendor_title: 'Steel Vendor',
    status: 10,
    currency: 'USD',
    total_price: 2500,
    order_date: 1709251200,
    expected_date: 1709251200,
    items: [
      {
        article_id: 100,
        quantity: 50,
        received: 0,
        unit_price: 50,
        total_price: 2500,
      },
    ],
  }

  it('maps id and externalId from pur_ord_id as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('500')
    expect(result.externalId).toBe('500')
  })

  it('maps number from code field', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from vendor_id as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('77')
  })

  it('maps status code 10 to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status code 5 to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: 5 })
    expect(result.status).toBe('draft')
  })

  it('maps status code 30 to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 30 })
    expect(result.status).toBe('received')
  })

  it('maps status code 110 to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: 110 })
    expect(result.status).toBe('cancelled')
  })

  it('maps currency field', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps totalAmount from total_price', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(2500)
  })

  it('maps line productId from article_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0]?.productId).toBe('100')
  })

  it('maps line quantityOrdered', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0]?.quantityOrdered).toBe(50)
  })

  it('sets platform to mrpeasy', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('mrpeasy')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
