import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSosInventoryPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/sos-inventory/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('sos-inventory transformPurchaseOrder', () => {
  const raw: RawSosInventoryPurchaseOrder = {
    id: 200,
    number: 'PO-2024-001',
    vendor: { id: 7, name: 'Widget World' },
    location: { id: 5, name: 'Seattle Fulfillment' },
    status: 'open',
    currency: 'USD',
    subTotal: 900,
    total: 1000,
    date: '2024-03-01T00:00:00Z',
    expectedDate: '2024-03-15T00:00:00Z',
    lines: [
      {
        item: { id: 99, name: 'Bulk Widget' },
        quantity: 10,
        received: 0,
        unitprice: 90,
        amount: 900,
      },
    ],
  }

  it('maps id (numeric) as string, number, and supplierId from vendor.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('200')
    expect(result.number).toBe('PO-2024-001')
    expect(result.supplierId).toBe('7')
    expect(result.platform).toBe('sos-inventory')
  })

  it('maps destinationLocationId from location.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('5')
  })

  it('maps status "open" to "sent"', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status "closed" to "closed"', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'closed' })
    expect(result.status).toBe('closed')
  })

  it('maps status "partially received" to "partially_received"', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'partially received' })
    expect(result.status).toBe('partially_received')
  })

  it('maps subTotal and total as-is (major units, not cents)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(900)
    expect(result.totalAmount).toBe(1000)
  })

  it('maps line items: productId from item.id, quantityOrdered, received, unitprice, amount', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('99')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    expect(result.lines[0]!.quantityReceived).toBe(0)
    expect(result.lines[0]!.unitCost).toBe(90)
    expect(result.lines[0]!.lineTotal).toBe(900)
  })

  it('maps date to orderedAt and expectedDate to expectedAt', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('produces output satisfying PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
