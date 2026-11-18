import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawKinaxisPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/kinaxis/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('kinaxis transformPurchaseOrder', () => {
  const raw: RawKinaxisPurchaseOrder = {
    id: 'po-uuid-001',
    orderNumber: 'PO-2024-100',
    supplierId: 'sup-001',
    destinationSiteId: 'site-uuid-001',
    status: 'Open',
    currency: 'USD',
    totalValue: 599.8,
    lines: [
      {
        partId: 'part-uuid-001',
        orderedQty: 20,
        receivedQty: 0,
        unitPrice: 29.99,
        lineTotal: 599.8,
      },
    ],
    orderDate: '2024-03-01T00:00:00Z',
    expectedDate: '2024-03-15T00:00:00Z',
    receivedDate: undefined,
  }

  it('maps id from raw.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('po-uuid-001')
    expect(result.externalId).toBe('po-uuid-001')
  })

  it('maps number from orderNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-100')
  })

  it('maps supplierId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('sup-001')
  })

  it('maps destinationLocationId from destinationSiteId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('site-uuid-001')
  })

  it('maps status Open to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status PartiallyReceived to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'PartiallyReceived' })
    expect(result.status).toBe('partially_received')
  })

  it('maps status Cancelled to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'Cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps currency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('passes through totalValue as-is (decimal, not minor units)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(599.8)
  })

  it('maps line items', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('part-uuid-001')
    expect(result.lines[0].quantityOrdered).toBe(20)
    expect(result.lines[0].unitCost).toBe(29.99)
  })

  it('maps orderedAt and expectedAt', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('sets platform to kinaxis', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('kinaxis')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw))).not.toThrow()
  })
})
