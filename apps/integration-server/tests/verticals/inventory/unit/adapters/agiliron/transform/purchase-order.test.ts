import { describe, it, expect } from 'vitest'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/inventory/adapters/agiliron/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder', () => {
  const raw = {
    PurchaseOrderId: 'PO-001',
    OrderNo: 'PO-001',
    VendorId: 'VEN-01',
    VendorName: 'Acme',
    Status: 'ORDERED',
    Currency: 'USD',
    SubTotal: 500,
    GrandTotal: 530,
    DueDate: '2024-03-01T00:00:00Z',
    OrderDate: '2024-03-01T00:00:00Z',
    OrderDetails: [{ ProductCode: 'WK-2026', ProductQty: 100, VendorPrice: 5 }],
  }

  it('maps id, supplierId, and status', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('PO-001')
    expect(result.supplierId).toBe('VEN-01')
    expect(result.status).toBe('sent')
    expect(result.platform).toBe('agiliron')
  })

  it('maps order lines', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0]?.productId).toBe('WK-2026')
    expect(result.lines[0]?.quantityOrdered).toBe(100)
    expect(result.lines[0]?.unitCost).toBe(5)
  })

  it('maps totals and currency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(500)
    expect(result.totalAmount).toBe(530)
    expect(result.currency).toBe('USD')
  })

  it('maps CREATED status to draft', () => {
    const result = transformPurchaseOrder({ ...raw, Status: 'CREATED' })
    expect(result.status).toBe('draft')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
