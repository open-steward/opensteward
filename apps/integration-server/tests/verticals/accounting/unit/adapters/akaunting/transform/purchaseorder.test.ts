import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type AkauntingPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<AkauntingPurchaseOrder> = {}): AkauntingPurchaseOrder {
  return {
    id: 99,
    document_number: 'PO-99',
    contact_id: 12,
    contact_name: 'Supplier Ltd',
    currency_code: 'USD',
    issued_at: '2024-01-15',
    status: 'active',
    amount: 2500,
    tax_total: 250,
    category_id: 2,
    items: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id to string id', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('99')
  })

  it('maps contact_id to contactId as string', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.contactId).toBe('12')
  })

  it('maps currency_code to currency', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.currency).toBe('USD')
  })

  it('maps amount to totalAmount', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.totalAmount).toBe(2500)
  })

  it('parses issued_at as Date', () => {
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

  it('maps received status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'received' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps voided status to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'voided' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps items to lineItems', () => {
    const raw = makePurchaseOrder({
      items: [
        {
          id: 20,
          item_id: 8,
          name: 'Part',
          description: 'A part',
          quantity: 10,
          price: 50,
          total: 500,
          tax: 50,
          tax_id: 3,
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('20')
    expect(li.itemId).toBe('8')
    expect(li.itemDescription).toBe('A part')
    expect(li.unitAmount).toBe(50)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(50)
    expect(li.taxrateId).toBe('3')
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
