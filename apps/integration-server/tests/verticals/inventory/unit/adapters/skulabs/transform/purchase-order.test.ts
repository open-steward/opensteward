import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSkulabsPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/skulabs/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('skulabs transformPurchaseOrder', () => {
  const raw: RawSkulabsPurchaseOrder = {
    _id: 'po-abc-001',
    number: 'PO-2024-001',
    distributor_id: 'dist-100',
    status: 'sent',
    currency: 'USD',
    subtotal: 400.0,
    total: 450.0,
    tax: 40.0,
    shipping: 10.0,
    discount: 0,
    warehouse_id: 'wh-abc',
    items: [
      {
        item_id: 'item-001',
        sku: 'SKL-KB-01',
        name: 'Mechanical Keyboard',
        quantity: 100,
        received: 0,
        cost: 4.0,
        rate: 4.5,
        type: 'item',
      },
    ],
    due_date: '2024-04-01T00:00:00Z',
    arrival_date: '2024-03-25T00:00:00Z',
    closed_date: null,
    memo: 'Urgent',
  }

  it('maps _id to id and externalId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('po-abc-001')
    expect(result.externalId).toBe('po-abc-001')
  })

  it('maps number to number', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps distributor_id to supplierId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('dist-100')
  })

  it('maps "sent" status to "sent"', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps "created" status to "draft"', () => {
    const draft: RawSkulabsPurchaseOrder = { ...raw, status: 'created' }
    expect(transformPurchaseOrder(draft).status).toBe('draft')
  })

  it('maps "receiving" status to "partially_received"', () => {
    const partial: RawSkulabsPurchaseOrder = { ...raw, status: 'receiving' }
    expect(transformPurchaseOrder(partial).status).toBe('partially_received')
  })

  it('maps "closed" status to "closed"', () => {
    const closed: RawSkulabsPurchaseOrder = { ...raw, status: 'closed' }
    expect(transformPurchaseOrder(closed).status).toBe('closed')
  })

  it('converts subtotal to subtotalAmount in cents', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(40000)
  })

  it('converts total to totalAmount in cents', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(45000)
  })

  it('maps warehouse_id to destinationLocationId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('wh-abc')
  })

  it('prefers arrival_date over due_date for expectedAt', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-25T00:00:00.000Z')
  })

  it('falls back to due_date when arrival_date is absent', () => {
    const noDueDate: RawSkulabsPurchaseOrder = { ...raw, arrival_date: null }
    const result = transformPurchaseOrder(noDueDate)
    expect(result.expectedAt).toBe('2024-04-01T00:00:00.000Z')
  })

  it('maps items to lines', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    const line = result.lines[0]
    expect(line.productId).toBe('item-001')
    expect(line.quantityOrdered).toBe(100)
    expect(line.quantityReceived).toBe(0)
    expect(line.unitCost).toBe(400) // cost 4.0 → 400 cents
    // lineTotal = rate(4.5) * quantity(100) * 100 = 45000
    expect(line.lineTotal).toBe(45000)
  })

  it('satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw))).not.toThrow()
  })
})
