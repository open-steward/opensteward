import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSapPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/sap-inventory/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('sap-inventory transformPurchaseOrder', () => {
  const raw: RawSapPurchaseOrder = {
    PurchaseOrder: 'PO-1042',
    Supplier: 'SUP001',
    PurchaseOrderType: 'NB',
    DocumentCurrency: 'USD',
    TotalNetOrderAmount: '500.00',
    PurchaseOrderDate: '2024-03-01T00:00:00Z',
    to_PurchaseOrderItem: {
      results: [
        {
          PurchaseOrderItem: '10',
          Material: 'MAT-001',
          OrderQuantity: 10,
          NetPriceAmount: '50.00',
          GoodsReceiptQty: 5,
        },
      ],
    },
  }

  it('maps id from PurchaseOrder', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('PO-1042')
  })

  it('maps supplierId from Supplier', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('SUP001')
  })

  it('status is always sent (SAP PO lacks lifecycle status field)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps currency from DocumentCurrency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('converts TotalNetOrderAmount to minor units (× 100)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(50000) // 500.00 × 100
    expect(result.totalAmount).toBe(50000)
  })

  it('maps orderedAt from PurchaseOrderDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps lines from to_PurchaseOrderItem results', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('MAT-001')
    expect(result.lines[0].quantityOrdered).toBe(10)
    expect(result.lines[0].quantityReceived).toBe(5)
  })

  it('converts item NetPriceAmount to minor units for unitCost', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].unitCost).toBe(5000) // 50.00 × 100
  })

  it('computes lineTotal as unitCostMinor × qty', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].lineTotal).toBe(50000) // 5000 × 10
  })

  it('handles to_PurchaseOrderItem as plain array', () => {
    const result = transformPurchaseOrder({
      ...raw,
      to_PurchaseOrderItem: [{ Material: 'MAT-002', OrderQuantity: 3, NetPriceAmount: '10.00' }],
    })
    expect(result.lines[0].productId).toBe('MAT-002')
  })

  it('platform is sap-inventory', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('sap-inventory')
  })

  it('produces output satisfying PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
