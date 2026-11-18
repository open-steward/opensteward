import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawExtensivPurchaseOrder,
  type RawExtensivPurchaseOrderItem,
} from '../../../../../../../src/verticals/inventory/adapters/extensiv-order-manager/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('extensiv-order-manager transformPurchaseOrder', () => {
  const items: RawExtensivPurchaseOrderItem[] = [
    {
      purchaseOrderItemId: 5001,
      productStockId: 9001,
      vendorProductMasterSku: 'WK-2026',
      quantity: 50,
      originalUnitCost: { amount: 2500, currency: 'USD' },
      status: 'PENDING',
      estimatedDeliveryDate: '2024-04-01T00:00:00Z',
    },
  ]

  const raw: RawExtensivPurchaseOrder = {
    purchaseOrderId: 1001,
    number: 'PO-1001',
    customPurchaseOrderNumber: 'CUSTOM-PO-1001',
    vendorId: 42,
    destinationWarehouseId: 301,
    status: 'ISSUED',
    currency: 'USD',
    shippingCost: { amount: 500, currency: 'USD' },
    dateCreated: '2024-03-01T00:00:00Z',
    dateIssued: '2024-03-01T00:00:00Z',
    dateAuthorized: '2024-03-02T00:00:00Z',
    vendorConfirmByDate: '2024-04-01T00:00:00Z',
    purchaseOrderItems: items,
  }

  it('maps id from purchaseOrderId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('1001')
    expect(result.externalId).toBe('1001')
  })

  it('maps number from customPurchaseOrderNumber preferring it over number', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('CUSTOM-PO-1001')
  })

  it('falls back to number when customPurchaseOrderNumber is absent', () => {
    const result = transformPurchaseOrder({ ...raw, customPurchaseOrderNumber: null })
    expect(result.number).toBe('PO-1001')
  })

  it('maps supplierId from vendorId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('42')
  })

  it('maps destinationLocationId from destinationWarehouseId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('301')
  })

  it('maps status ISSUED to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status DRAFT to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps status RECEIVED to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'RECEIVED' })
    expect(result.status).toBe('received')
  })

  it('maps currency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps totalAmount from shippingCost.amount', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(500)
  })

  it('maps lines from purchaseOrderItems', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('9001')
    expect(result.lines[0]!.quantityOrdered).toBe(50)
    expect(result.lines[0]!.unitCost).toBe(2500)
  })

  it('maps orderedAt from dateIssued preferring it over dateCreated', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from vendorConfirmByDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-04-01T00:00:00.000Z')
  })

  it('handles null purchaseOrderItems gracefully', () => {
    const result = transformPurchaseOrder({ ...raw, purchaseOrderItems: null })
    expect(result.lines).toHaveLength(0)
  })

  it('sets platform to extensiv-order-manager', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('extensiv-order-manager')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
