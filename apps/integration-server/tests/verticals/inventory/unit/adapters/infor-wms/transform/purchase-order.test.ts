import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawInforWmsPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/infor-wms/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('infor-wms transformPurchaseOrder', () => {
  const raw: RawInforWmsPurchaseOrder = {
    receiptId: 'RCP-2024-001',
    purchaseOrderNumber: 'PO-2024-100',
    supplierId: 'SUPP-A',
    warehouseId: 'WH-001',
    status: 'OPEN',
    currencyCode: 'USD',
    totalOrderedValue: 15000,
    subtotalValue: 14000,
    orderedDate: '2024-03-01T00:00:00Z',
    expectedDate: '2024-03-15T00:00:00Z',
    lines: [
      { itemNumber: 'ITEM-001', orderedQty: 100, receivedQty: 0, unitCost: 150, lineTotal: 15000 },
    ],
  }

  it('maps id and externalId from receiptId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('RCP-2024-001')
    expect(result.externalId).toBe('RCP-2024-001')
  })

  it('maps number from purchaseOrderNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-100')
  })

  it('maps supplierId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('SUPP-A')
  })

  it('maps OPEN status to draft', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('draft')
  })

  it('maps IN_PROGRESS status to sent', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'IN_PROGRESS' })
    expect(result.status).toBe('sent')
  })

  it('maps PARTIALLY_RECEIVED status', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'PARTIALLY_RECEIVED' })
    expect(result.status).toBe('partially_received')
  })

  it('maps totalAmount and subtotalAmount', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(15000)
    expect(result.subtotalAmount).toBe(14000)
  })

  it('maps destinationLocationId from warehouseId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('WH-001')
  })

  it('maps lines with quantityOrdered', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('ITEM-001')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
  })

  it('sets platform to infor-wms', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('infor-wms')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
