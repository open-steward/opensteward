import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawAdvanceProPurchaseOrder,
  type RawAdvanceProPurchaseOrderLine,
} from '../../../../../../../src/verticals/inventory/adapters/advance-pro/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

const rawLine: RawAdvanceProPurchaseOrderLine = {
  productId: '42',
  quantity: 50,
  received: 50,
  unitCost: 5.0,
  lineTotal: 250.0,
}

const rawPurchaseOrder: RawAdvanceProPurchaseOrder = {
  id: '1',
  orderNumber: 'PO-001',
  vendorId: '10',
  status: 'SENT',
  currency: 'USD',
  subtotal: 250.0,
  total: 260.0,
  warehouseId: '5',
  expectedDate: '2024-03-01T00:00:00Z',
  lines: [rawLine],
}

describe('transformPurchaseOrder', () => {
  it('maps id, status, and supplierId', () => {
    const result = transformPurchaseOrder(rawPurchaseOrder)
    expect(result.id).toBe('1')
    expect(result.status).toBe('sent')
    expect(result.supplierId).toBe('10')
  })

  it('converts dollar amounts to cents', () => {
    const result = transformPurchaseOrder(rawPurchaseOrder)
    expect(result.subtotalAmount).toBe(25000)
    expect(result.totalAmount).toBe(26000)
  })

  it('converts line unitCost and lineTotal to cents', () => {
    const result = transformPurchaseOrder(rawPurchaseOrder)
    expect(result.lines[0]?.unitCost).toBe(500)
    expect(result.lines[0]?.lineTotal).toBe(25000)
  })

  it('maps destinationLocationId from warehouseId', () => {
    const result = transformPurchaseOrder(rawPurchaseOrder)
    expect(result.destinationLocationId).toBe('5')
  })

  it('passes PurchaseOrderSchema validation', () => {
    const result = transformPurchaseOrder(rawPurchaseOrder)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
