import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawCamelot3plPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/camelot-3pl/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('camelot-3pl transformPurchaseOrder', () => {
  const raw: RawCamelot3plPurchaseOrder = {
    orderId: 'order-001',
    orderNumber: 'PO-2024-001',
    vendorId: 'vendor-001',
    vendorName: 'Acme Supplies',
    status: 'SENT',
    currency: 'USD',
    totalAmount: 500,
    subtotalAmount: 450,
    warehouseId: 'wh-001',
    lines: [
      {
        itemId: 'item-001',
        quantityOrdered: 10,
        quantityReceived: 5,
        unitPrice: 45,
        lineTotal: 450,
      },
    ],
    orderDate: '2024-03-01T00:00:00Z',
    expectedDate: '2024-03-01T00:00:00Z',
    receivedDate: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from orderId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('order-001')
    expect(result.externalId).toBe('order-001')
  })

  it('maps number from orderNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from vendorId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('vendor-001')
  })

  it('maps destinationLocationId from warehouseId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('wh-001')
  })

  it('maps SENT status to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps DRAFT status to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps RECEIVED status to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'RECEIVED' })
    expect(result.status).toBe('received')
  })

  it('maps CANCELLED status to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps CLOSED status to closed', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'CLOSED' })
    expect(result.status).toBe('closed')
  })

  it('maps currency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps totalAmount', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(500)
  })

  it('maps subtotalAmount', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(450)
  })

  it('maps line items', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-001')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    expect(result.lines[0]!.quantityReceived).toBe(5)
    expect(result.lines[0]!.unitCost).toBe(45)
    expect(result.lines[0]!.lineTotal).toBe(450)
  })

  it('maps orderedAt from orderDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from expectedDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from receivedDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to camelot-3pl', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('camelot-3pl')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
