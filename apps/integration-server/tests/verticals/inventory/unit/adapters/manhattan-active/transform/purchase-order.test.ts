import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawManhattanActivePurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/manhattan-active/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('manhattan-active transformPurchaseOrder', () => {
  const raw: RawManhattanActivePurchaseOrder = {
    purchaseOrderId: 'PO-001',
    purchaseOrderNumber: 'MAN-PO-2024-001',
    supplierId: 'SUP-001',
    supplierName: 'Best Supplier',
    status: 'DRAFT',
    currency: 'USD',
    totalAmount: 1000.0,
    subtotalAmount: 975.0,
    facilityId: 'FAC-001',
    lines: [
      {
        itemId: 'ITEM-001',
        itemNumber: 'MAN-SKU-001',
        quantityOrdered: 20,
        quantityReceived: 0,
        unitCost: 50.0,
        lineTotal: 1000.0,
      },
    ],
    orderDate: '2024-03-01T00:00:00Z',
    expectedDeliveryDate: '2024-03-01T00:00:00Z',
    receivedDate: undefined,
  }

  it('maps id and externalId from purchaseOrderId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('PO-001')
    expect(result.externalId).toBe('PO-001')
  })

  it('maps number from purchaseOrderNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('MAN-PO-2024-001')
  })

  it('maps supplierId from supplierId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('SUP-001')
  })

  it('maps destinationLocationId from facilityId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('FAC-001')
  })

  it('maps DRAFT status to draft', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('draft')
  })

  it('maps SENT status to sent', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'SENT' })
    expect(result.status).toBe('sent')
  })

  it('maps PARTIALLY_RECEIVED status to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'PARTIALLY_RECEIVED' })
    expect(result.status).toBe('partially_received')
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

  it('maps currency from currency field', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps totalAmount and subtotalAmount', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(1000.0)
    expect(result.subtotalAmount).toBe(975.0)
  })

  it('maps lines from lines array', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('ITEM-001')
    expect(result.lines[0].quantityOrdered).toBe(20)
    expect(result.lines[0].unitCost).toBe(50.0)
    expect(result.lines[0].lineTotal).toBe(1000.0)
  })

  it('maps orderedAt from orderDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from expectedDeliveryDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to manhattan-active', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('manhattan-active')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw))).not.toThrow()
  })
})
