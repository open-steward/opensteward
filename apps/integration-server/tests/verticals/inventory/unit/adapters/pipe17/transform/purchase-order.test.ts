import { describe, it, expect } from 'vitest'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/inventory/adapters/pipe17/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — pipe17 purchase', () => {
  const raw = {
    purchaseId: 'po_001',
    poNumber: 'PO-1042',
    supplierId: 'sup_55',
    supplierName: 'Keyboards Inc',
    status: 'sent',
    currency: 'USD',
    totalAmount: 4999,
    subtotalAmount: 4500,
    destinationLocationId: 'loc_sfo1',
    lines: [
      {
        productId: 'prod_123',
        sku: 'WK-2026',
        quantityOrdered: 100,
        quantityReceived: 50,
        unitCost: 45,
        lineTotal: 4500,
      },
    ],
    expectedAt: '2024-03-01T00:00:00Z',
    orderedAt: '2024-03-01T00:00:00Z',
    receivedAt: '2024-03-01T00:00:00Z',
  }
  const result = transformPurchaseOrder(raw)

  it('sets id from purchaseId', () => {
    expect(result.id).toBe('po_001')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('po_001')
  })

  it('sets number from poNumber', () => {
    expect(result.number).toBe('PO-1042')
  })

  it('sets supplierId from supplierId field', () => {
    expect(result.supplierId).toBe('sup_55')
  })

  it('sets destinationLocationId', () => {
    expect(result.destinationLocationId).toBe('loc_sfo1')
  })

  it('maps status "sent" → sent', () => {
    expect(result.status).toBe('sent')
  })

  it('sets currency', () => {
    expect(result.currency).toBe('USD')
  })

  it('sets totalAmount', () => {
    expect(result.totalAmount).toBe(4999)
  })

  it('sets subtotalAmount', () => {
    expect(result.subtotalAmount).toBe(4500)
  })

  it('maps line productId from productId field', () => {
    expect(result.lines[0]!.productId).toBe('prod_123')
  })

  it('maps line quantityOrdered', () => {
    expect(result.lines[0]!.quantityOrdered).toBe(100)
  })

  it('maps line quantityReceived', () => {
    expect(result.lines[0]!.quantityReceived).toBe(50)
  })

  it('sets expectedAt, orderedAt, receivedAt', () => {
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to pipe17', () => {
    expect(result.platform).toBe('pipe17')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — status mapping', () => {
  const makeRaw = (status: string) => ({
    purchaseId: 'po_x',
    supplierId: 'sup_1',
    status,
    lines: [],
  })

  it('maps "draft" → draft', () => {
    expect(transformPurchaseOrder(makeRaw('draft')).status).toBe('draft')
  })

  it('maps "open" → sent', () => {
    expect(transformPurchaseOrder(makeRaw('open')).status).toBe('sent')
  })

  it('maps "partial" → partially_received', () => {
    expect(transformPurchaseOrder(makeRaw('partial')).status).toBe('partially_received')
  })

  it('maps "received" → received', () => {
    expect(transformPurchaseOrder(makeRaw('received')).status).toBe('received')
  })

  it('maps "closed" → closed', () => {
    expect(transformPurchaseOrder(makeRaw('closed')).status).toBe('closed')
  })

  it('maps "canceled" → cancelled', () => {
    expect(transformPurchaseOrder(makeRaw('canceled')).status).toBe('cancelled')
  })

  it('maps unknown → draft', () => {
    expect(transformPurchaseOrder(makeRaw('weird_status')).status).toBe('draft')
  })
})

describe('transformPurchaseOrder — orderedAt fallback to createdAt', () => {
  const result = transformPurchaseOrder({
    purchaseId: 'po_2',
    supplierId: 'sup_1',
    status: 'draft',
    createdAt: '2024-03-01T00:00:00Z',
    lines: [],
  })

  it('falls back orderedAt to createdAt when orderedAt absent', () => {
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })
})
