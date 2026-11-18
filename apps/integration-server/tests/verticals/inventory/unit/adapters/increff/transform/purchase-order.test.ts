import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawIncreffPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/increff/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('increff transformPurchaseOrder', () => {
  const raw: RawIncreffPurchaseOrder = {
    inwardOrderCode: 'IO-2024-001',
    supplierCode: 'SUP-DC-01',
    warehouseCode: 'WH-MUM-01',
    status: 'CREATED',
    currency: 'INR',
    totalAmount: 50000,
    items: [
      { skuCode: 'SKU-001', orderedQty: 25, receivedQty: 0, unitCost: 1000, lineTotal: 25000 },
    ],
    orderedOn: '2024-03-01T00:00:00Z',
    expectedDate: '2024-03-15T00:00:00Z',
  }

  it('maps id, externalId, and number all from inwardOrderCode', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('IO-2024-001')
    expect(result.externalId).toBe('IO-2024-001')
    expect(result.number).toBe('IO-2024-001')
  })

  it('maps supplierId from supplierCode', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('SUP-DC-01')
  })

  it('maps CREATED status to draft', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('draft')
  })

  it('maps PARTIALLY_RECEIVED status', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'PARTIALLY_RECEIVED' })
    expect(result.status).toBe('partially_received')
  })

  it('maps destinationLocationId from warehouseCode', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('WH-MUM-01')
  })

  it('maps totalAmount as-is (not converted to minor units)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(50000)
  })

  it('maps lines from items', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('SKU-001')
    expect(result.lines[0]!.quantityOrdered).toBe(25)
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
