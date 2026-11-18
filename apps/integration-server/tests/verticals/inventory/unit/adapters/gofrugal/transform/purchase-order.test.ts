import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawGofrugalPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/gofrugal/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('gofrugal transformPurchaseOrder', () => {
  const raw: RawGofrugalPurchaseOrder = {
    purchaseOrderId: 500,
    orderNumber: 'PO-2024-001',
    supplierId: 12,
    status: 'ORDERED',
    currency: 'INR',
    totalAmount: 1500.5,
    locationId: 3,
    lines: [{ itemId: 101, quantity: 10, receivedQty: 5, unitPrice: 100.0, lineTotal: 1000.0 }],
    orderDate: '2024-03-01T00:00:00Z',
    expectedDate: '2024-03-15T00:00:00Z',
  }

  it('maps id and externalId from purchaseOrderId as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('500')
    expect(result.externalId).toBe('500')
  })

  it('maps supplierId from supplierId field', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('12')
  })

  it('maps ORDERED status to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('converts totalAmount to minor units (paise)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(150050)
  })

  it('maps line items correctly', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('101')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    expect(result.lines[0]!.unitCost).toBe(10000)
  })

  it('defaults status to draft for unknown status', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'UNKNOWN_STATUS' })
    expect(result.status).toBe('draft')
  })

  it('maps CANCELLED status', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('falls back currency to INR when absent', () => {
    const result = transformPurchaseOrder({ ...raw, currency: undefined })
    expect(result.currency).toBe('INR')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
