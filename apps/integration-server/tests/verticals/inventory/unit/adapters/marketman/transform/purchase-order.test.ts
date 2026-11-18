import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawMarketmanPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/marketman/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('marketman transformPurchaseOrder', () => {
  const raw: RawMarketmanPurchaseOrder = {
    OrderNumber: 'PO-100',
    BuyerName: 'Main Restaurant',
    BuyerGuid: 'buyer-guid-abc',
    VendorName: 'Best Supplier',
    VendorGuid: 'vendor-guid-xyz',
    DeliveryDateUTC: '2024-03-01T00:00:00Z',
    SentDateUTC: '2024-03-01T00:00:00Z',
    PriceTotalWithoutVAT: 100,
    PriceTotalWithVAT: 120,
    OrderStatus: 'SENT',
    Items: [
      {
        ItemName: 'Olive Oil',
        SKU: 'OLV-001',
        CatalogItemID: 42,
        Quantity: 5,
        Price: 20,
        PriceTotal: 100,
      },
    ],
  }

  it('maps id and externalId from OrderNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('PO-100')
    expect(result.externalId).toBe('PO-100')
  })

  it('maps number from OrderNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-100')
  })

  it('maps supplierId from VendorGuid', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('vendor-guid-xyz')
  })

  it('maps destinationLocationId from BuyerGuid', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('buyer-guid-abc')
  })

  it('maps status SENT to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status DRAFT to draft', () => {
    const result = transformPurchaseOrder({ ...raw, OrderStatus: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps status RECEIVED to received', () => {
    const result = transformPurchaseOrder({ ...raw, OrderStatus: 'RECEIVED' })
    expect(result.status).toBe('received')
  })

  it('maps totalAmount from PriceTotalWithVAT', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(120)
  })

  it('maps line productId from CatalogItemID', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0]?.productId).toBe('42')
  })

  it('maps line quantityOrdered', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0]?.quantityOrdered).toBe(5)
  })

  it('sets platform to marketman', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('marketman')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
