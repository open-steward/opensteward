import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawDeckCommercePurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/deck-commerce/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('deck-commerce transformPurchaseOrder', () => {
  const raw: RawDeckCommercePurchaseOrder = {
    PurchaseOrderID: 'dc-po-001',
    PoNumber: 'PO-DC-001',
    SupplierCode: 'SUPP-01',
    SupplierID: 'supplier-001',
    DestinationWarehouse: 'WH1',
    Status: 'ISSUED',
    Currency: 'USD',
    TotalAmount: 500,
    SubtotalAmount: 450,
    Lines: [
      {
        SKU: 'DC-SKU-001',
        Qty: 10,
        ReceivedQty: 0,
        UnitCost: 45,
        LineTotal: 450,
      },
    ],
    IssuedDateUTC: '2024-03-01T00:00:00Z',
    ExpectedDateUTC: '2024-03-15T00:00:00Z',
  }

  it('maps id and externalId from PurchaseOrderID', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('dc-po-001')
    expect(result.externalId).toBe('dc-po-001')
  })

  it('maps number from PoNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-DC-001')
  })

  it('maps supplierId preferring SupplierID over SupplierCode', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('supplier-001')
  })

  it('falls back to SupplierCode when SupplierID absent', () => {
    const result = transformPurchaseOrder({ ...raw, SupplierID: undefined })
    expect(result.supplierId).toBe('SUPP-01')
  })

  it('maps status ISSUED to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status DRAFT to draft', () => {
    const result = transformPurchaseOrder({ ...raw, Status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps status RECEIVED to received', () => {
    const result = transformPurchaseOrder({ ...raw, Status: 'RECEIVED' })
    expect(result.status).toBe('received')
  })

  it('maps status CLOSED to closed', () => {
    const result = transformPurchaseOrder({ ...raw, Status: 'CLOSED' })
    expect(result.status).toBe('closed')
  })

  it('maps destinationLocationId from DestinationWarehouse', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('WH1')
  })

  it('maps amounts as-is (not converted)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(500)
    expect(result.subtotalAmount).toBe(450)
  })

  it('maps lines correctly', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('DC-SKU-001')
    expect(result.lines[0].quantityOrdered).toBe(10)
  })

  it('maps orderedAt from IssuedDateUTC', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to deck-commerce', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('deck-commerce')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
