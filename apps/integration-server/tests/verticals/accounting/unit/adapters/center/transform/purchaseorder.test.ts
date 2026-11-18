import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type CenterPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/center/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<CenterPurchaseOrder> = {}): CenterPurchaseOrder {
  return {
    id: 'ctr-po-1',
    orderNumber: 'PO-001',
    contactId: 'supplier-25',
    currency: 'USD',
    subtotal: 3000,
    taxAmount: 300,
    total: 3300,
    items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id to id', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('ctr-po-1')
  })

  it('maps contactId to contactId', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.contactId).toBe('supplier-25')
  })

  it('maps currency to currency', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.totalAmount).toBe(3300)
  })

  it('parses date as Date', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps active status to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps received status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'received' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps void status to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'void' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps items to lineItems', () => {
    const raw = makePurchaseOrder({
      items: [
        {
          id: 'item-2',
          name: 'Supply',
          description: 'A supply item',
          quantity: 8,
          unitPrice: 50,
          total: 400,
          taxAmount: 40,
          accountId: 'acc-6',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-2')
    expect(li.itemName).toBe('Supply')
    expect(li.itemDescription).toBe('A supply item')
    expect(li.unitAmount).toBe(50)
    expect(li.unitQuantity).toBe(8)
    expect(li.totalAmount).toBe(400)
    expect(li.taxAmount).toBe(40)
    expect(li.accountId).toBe('acc-6')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
