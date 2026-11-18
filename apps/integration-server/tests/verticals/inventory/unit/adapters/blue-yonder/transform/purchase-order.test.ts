import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawBlueYonderReceipt,
} from '../../../../../../../src/verticals/inventory/adapters/blue-yonder/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('blue-yonder transformPurchaseOrder', () => {
  const raw: RawBlueYonderReceipt = {
    receiptId: 'receipt-001',
    referenceNumber: 'REF-2024-001',
    status: 'Expected',
    expectedDate: '2024-03-01T00:00:00Z',
    arrivedDate: '2024-03-01T00:00:00Z',
    supplierId: 'sup-001',
    supplierName: 'Acme Corp',
    lineItems: [
      {
        lineId: 'line-001',
        itemId: 'item-001',
        itemDescription: 'Widget A',
        expectedQuantity: 10,
        receivedQuantity: 5,
        unitOfMeasure: 'EA',
      },
    ],
  }

  it('maps id and externalId from receiptId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('receipt-001')
    expect(result.externalId).toBe('receipt-001')
  })

  it('maps number from referenceNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('REF-2024-001')
  })

  it('maps supplierId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('sup-001')
  })

  it('maps Expected status to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps Completed status to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'Completed' })
    expect(result.status).toBe('received')
  })

  it('maps Cancelled status to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'Cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps InProgress status to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'InProgress' })
    expect(result.status).toBe('partially_received')
  })

  it('maps line items', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-001')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    expect(result.lines[0]!.quantityReceived).toBe(5)
  })

  it('maps expectedAt and receivedAt to ISO datetimes', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to blue-yonder', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('blue-yonder')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
