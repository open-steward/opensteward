import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSupyPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/supy/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

function makeRaw(overrides: Partial<RawSupyPurchaseOrder> = {}): RawSupyPurchaseOrder {
  return {
    id: 'po-777',
    orderNumber: 'ORD-777',
    supplierId: 'sup-1',
    supplierName: 'Metro Foods',
    branchId: 'branch-3',
    status: 'sent',
    currency: 'USD',
    subtotal: 200,
    total: 220,
    lines: [
      {
        itemId: 'item-10',
        itemName: 'Olive Oil',
        quantity: 10,
        receivedQuantity: 5,
        unitCost: 20,
        totalCost: 200,
      },
    ],
    orderedAt: '2024-03-01T00:00:00Z',
    expectedDeliveryDate: '2024-03-15T00:00:00Z',
    receivedAt: undefined,
    notes: 'Rush order',
    ...overrides,
  }
}

describe('transformPurchaseOrder (supy)', () => {
  it('maps id and externalId', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('po-777')
    expect(result.externalId).toBe('po-777')
  })

  it('maps number from orderNumber', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.number).toBe('ORD-777')
  })

  it('maps supplierId and destinationLocationId', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.supplierId).toBe('sup-1')
    expect(result.destinationLocationId).toBe('branch-3')
  })

  it('maps status "sent" → "sent"', () => {
    const result = transformPurchaseOrder(makeRaw({ status: 'sent' }))
    expect(result.status).toBe('sent')
  })

  it('maps status "partially_received" → "partially_received"', () => {
    const result = transformPurchaseOrder(makeRaw({ status: 'partially_received' }))
    expect(result.status).toBe('partially_received')
  })

  it('maps status "cancelled" → "cancelled"', () => {
    const result = transformPurchaseOrder(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('cancelled')
  })

  it('maps line items', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-10')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    expect(result.lines[0]!.quantityReceived).toBe(5)
  })

  it('maps orderedAt and expectedAt as ISO strings', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('platform is "supy"', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.platform).toBe('supy')
  })

  it('passes PurchaseOrderSchema validation', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
