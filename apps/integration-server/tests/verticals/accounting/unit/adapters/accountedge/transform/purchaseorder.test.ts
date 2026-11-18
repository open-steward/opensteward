import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type AccountEdgePurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/accountedge/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<AccountEdgePurchaseOrder> = {}): AccountEdgePurchaseOrder {
  return {
    id: 'po-1',
    order_number: 'PO-001',
    supplier_id: 'supplier-1',
    currency: 'AUD',
    total: 8000,
    tax_amount: 800,
    line_items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformPurchaseOrder (accountedge)', () => {
  it('maps id and core fields', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('po-1')
    expect(result.contactId).toBe('supplier-1')
    expect(result.currency).toBe('AUD')
    expect(result.totalAmount).toBe(8000)
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status "active" to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status "draft" to DRAFT', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status "received" to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'received' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status "completed" to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status "cancelled" to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status "void" to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'void' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps line items correctly', () => {
    const raw = makePurchaseOrder({
      line_items: [
        {
          id: 'li-1',
          description: 'Supply',
          quantity: 10,
          unit_price: 50,
          amount: 500,
          tax_amount: 50,
          account_id: '5000',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.itemDescription).toBe('Supply')
    expect(li.unitAmount).toBe(50)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(50)
    expect(li.accountId).toBe('5000')
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
