import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawRevelPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/revel-systems/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('revel-systems transformPurchaseOrder', () => {
  const raw: RawRevelPurchaseOrder = {
    id: 99,
    purchase_order_number: 'PO-0042',
    vendor: '/resources/Vendor/12/',
    status: 'Ordered',
    establishment: '/resources/Establishment/5/',
    created_date: '2024-03-01T00:00:00Z',
    expected_delivery_date: '2024-03-15T00:00:00Z',
    completed_date: null,
    purchase_order_items: [
      {
        id: 1,
        ingredient: '/resources/Ingredient/77/',
        quantity: 50,
        received_quantity: 0,
        unit_cost: 10.5,
        total: 525.0,
      },
    ],
  }

  it('stringifies numeric id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('99')
    expect(result.externalId).toBe('99')
  })

  it('extracts supplierId from vendor URI', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('12')
  })

  it('extracts destinationLocationId from establishment URI', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('5')
  })

  it('maps "Ordered" status to "sent"', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status values', () => {
    expect(transformPurchaseOrder({ ...raw, status: 'Draft' }).status).toBe('draft')
    expect(transformPurchaseOrder({ ...raw, status: 'Partially Received' }).status).toBe(
      'partially_received',
    )
    expect(transformPurchaseOrder({ ...raw, status: 'Received' }).status).toBe('received')
    expect(transformPurchaseOrder({ ...raw, status: 'Completed' }).status).toBe('closed')
    expect(transformPurchaseOrder({ ...raw, status: 'Cancelled' }).status).toBe('cancelled')
  })

  it('converts unit_cost dollars to cents', () => {
    const result = transformPurchaseOrder(raw)
    // 10.50 * 100 = 1050 cents
    expect(result.lines[0]!.unitCost).toBe(1050)
  })

  it('converts line total dollars to cents', () => {
    const result = transformPurchaseOrder(raw)
    // 525.00 * 100 = 52500 cents
    expect(result.lines[0]!.lineTotal).toBe(52500)
  })

  it('extracts productId from ingredient URI', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0]!.productId).toBe('77')
  })

  it('maps quantityOrdered and quantityReceived', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0]!.quantityOrdered).toBe(50)
    expect(result.lines[0]!.quantityReceived).toBe(0)
  })

  it('maps orderedAt and expectedAt', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('maps currency to USD', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps number from purchase_order_number', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-0042')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
