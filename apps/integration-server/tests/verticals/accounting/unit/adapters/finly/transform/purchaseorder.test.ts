import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type FinlyPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/finly/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<FinlyPurchaseOrder> = {}): FinlyPurchaseOrder {
  return {
    id: 'po-1',
    order_number: 'PO-001',
    vendor_id: 'vendor-7',
    currency: 'USD',
    subtotal: 400,
    tax_amount: 100,
    total_amount: 500,
    items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformPurchaseOrder (finly)', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('po-1')
  })

  it('maps vendor_id to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('vendor-7')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(500)
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('USD')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status received to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status void to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'void' })).status).toBe('CANCELLED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps items to lineItems', () => {
    const raw = makePurchaseOrder({
      items: [
        {
          id: 'li-1',
          name: 'Supplies',
          description: 'Office supplies',
          quantity: 5,
          unit_price: 20,
          total: 100,
          tax: 10,
          account_id: 'acc-5',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(100)
    expect(li.taxAmount).toBe(10)
    expect(li.accountId).toBe('acc-5')
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
