import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawE2openPurchaseOrder,
  type RawE2openPurchaseOrderLine,
} from '../../../../../../../src/verticals/inventory/adapters/e2open/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('e2open transformPurchaseOrder', () => {
  const line: RawE2openPurchaseOrderLine = {
    lineNumber: 1,
    itemId: 'ITEM-001',
    orderedQty: 200,
    receivedQty: 100,
    unitPrice: 5.0,
    lineTotal: 1000,
  }

  const raw: RawE2openPurchaseOrder = {
    purchaseOrderId: 'PO-E2O-001',
    purchaseOrderNumber: 'PO-2024-001',
    supplierId: 'SUP-001',
    zymeId: 'ZYME-001',
    buyerId: 'BUYER-001',
    status: 'CONFIRMED',
    currencyCode: 'USD',
    totalAmount: 1000,
    subTotalAmount: 950,
    shipToLocationId: 'LOC-001',
    lines: [line],
    orderDate: '2024-03-01T00:00:00.000Z',
    requestedDeliveryDate: '2024-03-01T00:00:00.000Z',
    confirmedDeliveryDate: '2024-03-01T00:00:00.000Z',
    receiptDate: '2024-03-01T00:00:00.000Z',
  }

  it('maps id and externalId from purchaseOrderId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('PO-E2O-001')
    expect(result.externalId).toBe('PO-E2O-001')
  })

  it('maps number from purchaseOrderNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from supplierId field', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('SUP-001')
  })

  it('falls back to zymeId when supplierId absent', () => {
    const result = transformPurchaseOrder({ ...raw, supplierId: undefined })
    expect(result.supplierId).toBe('ZYME-001')
  })

  it('maps destinationLocationId from shipToLocationId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('LOC-001')
  })

  it('maps status CONFIRMED to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status DRAFT to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps status PARTIAL_RECEIPT to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'PARTIAL_RECEIPT' })
    expect(result.status).toBe('partially_received')
  })

  it('maps status RECEIVED to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'RECEIVED' })
    expect(result.status).toBe('received')
  })

  it('maps status CLOSED to closed', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'CLOSED' })
    expect(result.status).toBe('closed')
  })

  it('maps status CANCELLED to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('converts totalAmount to minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(100000)
  })

  it('converts subTotalAmount to minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(95000)
  })

  it('maps currency from currencyCode', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps line productId from itemId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].productId).toBe('ITEM-001')
  })

  it('maps line quantityOrdered from orderedQty', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].quantityOrdered).toBe(200)
  })

  it('maps line quantityReceived from receivedQty', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].quantityReceived).toBe(100)
  })

  it('converts line unitPrice to minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].unitCost).toBe(500)
  })

  it('maps expectedAt from confirmedDeliveryDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps orderedAt from orderDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from receiptDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to e2open', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('e2open')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
