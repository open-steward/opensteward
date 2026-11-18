import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawDaVinciUnifiedPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/da-vinci-unified/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('da-vinci-unified transformPurchaseOrder', () => {
  const raw: RawDaVinciUnifiedPurchaseOrder = {
    receiptId: 'rcpt-001',
    receiptNumber: 'PO-1001',
    vendorId: 'vendor-42',
    status: 'SUBMITTED',
    currencyCode: 'USD',
    totalAmount: 500,
    subtotalAmount: 450,
    warehouseId: 'wh-001',
    lines: [
      {
        itemId: 'item-001',
        quantityOrdered: 10,
        quantityReceived: 5,
        unitCost: 45,
        lineTotal: 450,
      },
    ],
    orderDate: '2024-03-01T00:00:00Z',
    expectedDate: '2024-03-15T00:00:00Z',
  }

  it('maps id and externalId from receiptId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('rcpt-001')
    expect(result.externalId).toBe('rcpt-001')
  })

  it('maps number from receiptNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-1001')
  })

  it('maps supplierId from vendorId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('vendor-42')
  })

  it('maps status SUBMITTED to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status DRAFT to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps status COMPLETED to closed', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'COMPLETED' })
    expect(result.status).toBe('closed')
  })

  it('maps status VOIDED to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'VOIDED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps destinationLocationId from warehouseId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('wh-001')
  })

  it('maps lines correctly', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('item-001')
    expect(result.lines[0].quantityOrdered).toBe(10)
    expect(result.lines[0].quantityReceived).toBe(5)
  })

  it('maps orderedAt and expectedAt', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('sets platform to da-vinci-unified', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('da-vinci-unified')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
