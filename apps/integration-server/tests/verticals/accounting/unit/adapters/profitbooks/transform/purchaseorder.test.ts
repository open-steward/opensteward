import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type ProfitBooksPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/profitbooks/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<ProfitBooksPurchaseOrder> = {}): ProfitBooksPurchaseOrder {
  return {
    id: 'pb-po-1',
    order_number: 'PO-001',
    contact_id: 'vendor-2',
    currency: 'INR',
    total_amount: 2000,
    tax_amount: 360,
    items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformPurchaseOrder (profitbooks)', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('pb-po-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('vendor-2')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(2000)
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('INR')
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

  it('maps status draft to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('maps items to lineItems', () => {
    const raw = makePurchaseOrder({
      items: [
        {
          id: 'item-po-1',
          name: 'Paper',
          description: 'A4',
          quantity: 10,
          rate: 10,
          amount: 100,
          tax_amount: 18,
          account_id: 'acc-purchase',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-po-1')
    expect(li.totalAmount).toBe(100)
    expect(li.taxAmount).toBe(18)
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
