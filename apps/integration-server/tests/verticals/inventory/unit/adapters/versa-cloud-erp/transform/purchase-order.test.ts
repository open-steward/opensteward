import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawVersaPurchaseOrder,
  type RawVersaPurchaseOrderLine,
} from '../../../../../../../src/verticals/inventory/adapters/versa-cloud-erp/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

const baseLines: RawVersaPurchaseOrderLine[] = [
  {
    id: 'line-001',
    item_id: 'item-001',
    quantity: 100,
    quantity_received: 0,
    per_unit_cost: 14.99,
    total: 1499,
  },
]

const baseRaw: RawVersaPurchaseOrder = {
  id: 'po-001',
  order_number: 'PO-2024-001',
  supplier: 'vendor-001',
  supplier_name: 'Keyboards Inc',
  status: 'sent',
  currency: 'USD',
  subtotal: 1499,
  total: 1499,
  location_id: 'loc-001',
  order_items: baseLines,
  order_date: '2024-03-01T00:00:00Z',
  expected_delivery_date: '2024-03-15T00:00:00Z',
}

describe('versa-cloud-erp transformPurchaseOrder', () => {
  it('maps id from id field', () => {
    expect(transformPurchaseOrder(baseRaw).id).toBe('po-001')
  })

  it('maps number from order_number', () => {
    expect(transformPurchaseOrder(baseRaw).number).toBe('PO-2024-001')
  })

  it('maps supplierId from supplier field', () => {
    expect(transformPurchaseOrder(baseRaw).supplierId).toBe('vendor-001')
  })

  it('maps destinationLocationId from location_id', () => {
    expect(transformPurchaseOrder(baseRaw).destinationLocationId).toBe('loc-001')
  })

  it('maps status sent to sent', () => {
    expect(transformPurchaseOrder(baseRaw).status).toBe('sent')
  })

  it('maps status draft to draft', () => {
    expect(transformPurchaseOrder({ ...baseRaw, status: 'draft' }).status).toBe('draft')
  })

  it('maps status received to received', () => {
    expect(transformPurchaseOrder({ ...baseRaw, status: 'received' }).status).toBe('received')
  })

  it('maps status cancelled to cancelled', () => {
    expect(transformPurchaseOrder({ ...baseRaw, status: 'cancelled' }).status).toBe('cancelled')
  })

  it('maps currency from currency field', () => {
    expect(transformPurchaseOrder(baseRaw).currency).toBe('USD')
  })

  it('converts subtotal and total to minor units', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.subtotalAmount).toBe(149900)
    expect(result.totalAmount).toBe(149900)
  })

  it('maps lines with productId and quantityOrdered', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-001')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
  })

  it('converts line unit cost to minor units', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.lines[0]!.unitCost).toBe(1499)
  })

  it('maps orderedAt from order_date', () => {
    expect(transformPurchaseOrder(baseRaw).orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from expected_delivery_date', () => {
    expect(transformPurchaseOrder(baseRaw).expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('sets platform to versa-cloud-erp', () => {
    expect(transformPurchaseOrder(baseRaw).platform).toBe('versa-cloud-erp')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(baseRaw))).not.toThrow()
  })
})
