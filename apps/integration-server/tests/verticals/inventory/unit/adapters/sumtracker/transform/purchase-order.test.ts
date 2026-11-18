import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSumtrackerPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/sumtracker/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

function makeRaw(overrides: Partial<RawSumtrackerPurchaseOrder> = {}): RawSumtrackerPurchaseOrder {
  return {
    id: 200,
    po_number: 'PO-200',
    supplier_id: 10,
    warehouse_id: 3,
    status: 'ordered',
    currency: 'USD',
    subtotal: 100.0,
    total: 110.0,
    items: [
      {
        product_id: 'prod-1',
        quantity: 50,
        received_qty: 10,
        unit_cost: 2.0,
        line_total: 100.0,
      },
    ],
    order_date: '2024-03-01T00:00:00Z',
    expected_date: '2024-03-15T00:00:00Z',
    received_date: undefined,
    ...overrides,
  }
}

describe('transformPurchaseOrder (sumtracker)', () => {
  it('maps id and externalId from numeric raw.id', () => {
    const result = transformPurchaseOrder(makeRaw({ id: 200 }))
    expect(result.id).toBe('200')
    expect(result.externalId).toBe('200')
  })

  it('maps number from po_number', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.number).toBe('PO-200')
  })

  it('maps supplierId and destinationLocationId', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.supplierId).toBe('10')
    expect(result.destinationLocationId).toBe('3')
  })

  it('maps status "ordered" → "sent"', () => {
    const result = transformPurchaseOrder(makeRaw({ status: 'ordered' }))
    expect(result.status).toBe('sent')
  })

  it('maps status "partial" → "partially_received"', () => {
    const result = transformPurchaseOrder(makeRaw({ status: 'partial' }))
    expect(result.status).toBe('partially_received')
  })

  it('maps status "cancelled" → "cancelled"', () => {
    const result = transformPurchaseOrder(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('cancelled')
  })

  it('maps line items correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-1')
    expect(result.lines[0]!.quantityOrdered).toBe(50)
    expect(result.lines[0]!.quantityReceived).toBe(10)
  })

  it('maps orderedAt and expectedAt as ISO strings', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('platform is "sumtracker"', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.platform).toBe('sumtracker')
  })

  it('handles empty items array', () => {
    const result = transformPurchaseOrder(makeRaw({ items: [] }))
    expect(result.lines).toEqual([])
  })

  it('passes PurchaseOrderSchema validation', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
