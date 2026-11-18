import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawVendConsignment,
  type RawVendConsignmentProduct,
} from '../../../../../../../src/verticals/inventory/adapters/vend-pos/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

const baseLines: RawVendConsignmentProduct[] = [
  { id: 'cp-1', product_id: 'prod-uuid-001', sku: 'WK-2026', count: 100, received: 0, cost: 14.99 },
]

const baseRaw: RawVendConsignment = {
  id: 'consignment-uuid-001',
  name: 'PO March 2024',
  supplier_id: 'sup-uuid-001',
  outlet_id: 'outlet-uuid-001',
  status: 'OPEN',
  type: 'SUPPLIER',
  due_at: '2024-03-15T00:00:00Z',
  consignment_date: '2024-03-01T00:00:00Z',
  reference: 'PO-2024-001',
  consignment_products: baseLines,
}

describe('vend-pos transformPurchaseOrder', () => {
  it('maps id from id field', () => {
    expect(transformPurchaseOrder(baseRaw).id).toBe('consignment-uuid-001')
  })

  it('maps number from reference, falling back to name', () => {
    expect(transformPurchaseOrder(baseRaw).number).toBe('PO-2024-001')
    const result = transformPurchaseOrder({ ...baseRaw, reference: undefined })
    expect(result.number).toBe('PO March 2024')
  })

  it('maps supplierId from supplier_id', () => {
    expect(transformPurchaseOrder(baseRaw).supplierId).toBe('sup-uuid-001')
  })

  it('maps destinationLocationId from outlet_id', () => {
    expect(transformPurchaseOrder(baseRaw).destinationLocationId).toBe('outlet-uuid-001')
  })

  it('maps status OPEN to draft', () => {
    expect(transformPurchaseOrder(baseRaw).status).toBe('draft')
  })

  it('maps status SENT to sent', () => {
    expect(transformPurchaseOrder({ ...baseRaw, status: 'SENT' }).status).toBe('sent')
  })

  it('maps status RECEIVED to received', () => {
    expect(transformPurchaseOrder({ ...baseRaw, status: 'RECEIVED' }).status).toBe('received')
  })

  it('maps status CANCELLED to cancelled', () => {
    expect(transformPurchaseOrder({ ...baseRaw, status: 'CANCELLED' }).status).toBe('cancelled')
  })

  it('maps lines with productId and quantityOrdered', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-uuid-001')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
  })

  it('converts line cost to minor units', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.lines[0]!.unitCost).toBe(1499)
  })

  it('maps orderedAt from consignment_date', () => {
    expect(transformPurchaseOrder(baseRaw).orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from due_at', () => {
    expect(transformPurchaseOrder(baseRaw).expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('sets platform to vend-pos', () => {
    expect(transformPurchaseOrder(baseRaw).platform).toBe('vend-pos')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(baseRaw))).not.toThrow()
  })
})
