import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSellercloudPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/sellercloud/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('sellercloud transformPurchaseOrder', () => {
  const raw: RawSellercloudPurchaseOrder = {
    ID: 1001,
    VendorID: 55,
    PurchaseOrderStatus: 'Ordered',
    GrandTotal: 500.0,
    OrderTotal: 490.0,
    CreatedOn: '2024-03-01T00:00:00Z',
    DateOrdered: '2024-03-02T00:00:00Z',
    ExpectedDeliveryDate: '2024-04-01T00:00:00Z',
    Items: [
      {
        ID: 1,
        ProductID: '777',
        ProductName: 'Widget A',
        QtyUnitsOrdered: 100,
        QtyReceived: 0,
        UnitPrice: 4.5,
        AdjustedPrice: 5.0,
        LineTotal: 500.0,
      },
    ],
  }

  it('maps ID to id and externalId as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('1001')
    expect(result.externalId).toBe('1001')
  })

  it('maps VendorID to supplierId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('55')
  })

  it('maps PurchaseOrderStatus "Ordered" to "sent"', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps "Saved" status to "draft"', () => {
    const saved: RawSellercloudPurchaseOrder = { ...raw, PurchaseOrderStatus: 'Saved' }
    expect(transformPurchaseOrder(saved).status).toBe('draft')
  })

  it('maps "Received" status to "received"', () => {
    const received: RawSellercloudPurchaseOrder = { ...raw, PurchaseOrderStatus: 'Received' }
    expect(transformPurchaseOrder(received).status).toBe('received')
  })

  it('maps "Competed" status to "closed"', () => {
    const competed: RawSellercloudPurchaseOrder = { ...raw, PurchaseOrderStatus: 'Competed' }
    expect(transformPurchaseOrder(competed).status).toBe('closed')
  })

  it('converts GrandTotal dollars to cents', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(50000)
  })

  it('maps ExpectedDeliveryDate to expectedAt', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-04-01T00:00:00.000Z')
  })

  it('prefers DateOrdered over CreatedOn for orderedAt', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-02T00:00:00.000Z')
  })

  it('falls back to CreatedOn when DateOrdered absent', () => {
    const noDateOrdered: RawSellercloudPurchaseOrder = { ...raw, DateOrdered: undefined }
    const result = transformPurchaseOrder(noDateOrdered)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps Items to lines with productId, quantities and costs', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    const line = result.lines[0]
    expect(line.productId).toBe('777')
    expect(line.quantityOrdered).toBe(100)
    // AdjustedPrice takes priority over UnitPrice
    expect(line.unitCost).toBe(500)
    expect(line.lineTotal).toBe(50000)
  })

  it('satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw))).not.toThrow()
  })
})
