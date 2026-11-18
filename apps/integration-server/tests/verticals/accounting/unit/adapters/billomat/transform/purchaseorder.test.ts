import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type BillomatPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/billomat/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<BillomatPurchaseOrder> = {}): BillomatPurchaseOrder {
  return {
    id: 'bm-po-1',
    order_number: 'PO-001',
    supplier_id: 'supp-20',
    currency_code: 'EUR',
    date: '2024-01-15',
    status: 'OPEN',
    total_gross: 3000,
    total_net: 2500,
    tax_amount: 500,
    order_items: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id to id', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('bm-po-1')
  })

  it('maps supplier_id to contactId', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.contactId).toBe('supp-20')
  })

  it('maps currency_code to currency', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.currency).toBe('EUR')
  })

  it('maps total_gross to totalAmount', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.totalAmount).toBe(3000)
  })

  it('parses date as Date', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps OPEN status to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'OPEN' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps DRAFT status to DRAFT', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'DRAFT' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps RECEIVED status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'RECEIVED' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps COMPLETED status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'COMPLETED' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps CANCELLED status to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'CANCELLED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps CANCELED status to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'CANCELED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps order_items to lineItems', () => {
    const raw = makePurchaseOrder({
      order_items: [
        {
          id: 'li-2',
          article_id: 'art-6',
          description: 'Supply',
          quantity: 5,
          unit_price: 80,
          total_gross: 400,
          tax_rate: 19,
          tax_amount: 76,
          account_id: 'acc-2',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-2')
    expect(li.itemId).toBe('art-6')
    expect(li.itemDescription).toBe('Supply')
    expect(li.unitAmount).toBe(80)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(400)
    expect(li.taxAmount).toBe(76)
    expect(li.accountId).toBe('acc-2')
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
