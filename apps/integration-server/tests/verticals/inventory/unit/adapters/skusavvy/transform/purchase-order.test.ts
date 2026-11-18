import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSkusavvyPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/skusavvy/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('skusavvy transformPurchaseOrder', () => {
  const raw: RawSkusavvyPurchaseOrder = {
    id: 'po-01',
    number: 'PO-2024-001',
    vendorId: 'vendor-42',
    status: 'open',
    currency: 'USD',
    subtotal: 450.0,
    total: 500.0,
    locationId: 'loc-01',
    lineItems: [
      {
        id: 'li-1',
        productId: 'prod-01',
        quantity: 10,
        quantityReceived: 5,
        unitCost: 45.0,
        lineTotal: 450.0,
      },
    ],
    orderedAt: '2024-03-01T00:00:00Z',
    expectedAt: '2024-03-15T00:00:00Z',
  }

  it('maps id, number, and supplierId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('po-01')
    expect(result.number).toBe('PO-2024-001')
    expect(result.supplierId).toBe('vendor-42')
    expect(result.platform).toBe('skusavvy')
  })

  it('maps status "open" to "sent"', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status "partial" to "partially_received"', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'partial' })
    expect(result.status).toBe('partially_received')
  })

  it('maps status "cancelled" to "cancelled"', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('converts subtotal and total from decimal dollars to integer cents', () => {
    // 450.0 → Math.round(450.0 * 100) = 45000
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(45000)
    expect(result.totalAmount).toBe(50000)
  })

  it('converts line item unitCost and lineTotal to integer cents', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0]!.unitCost).toBe(4500)
    expect(result.lines[0]!.lineTotal).toBe(45000)
  })

  it('maps line items: productId, quantityOrdered, quantityReceived', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-01')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    expect(result.lines[0]!.quantityReceived).toBe(5)
  })

  it('maps destinationLocationId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('loc-01')
  })

  it('maps orderedAt and expectedAt as ISO strings', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('produces output satisfying PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
