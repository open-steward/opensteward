import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type SunrisePurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/sunrise/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<SunrisePurchaseOrder> = {}): SunrisePurchaseOrder {
  return {
    id: 'sunrise-po-1',
    order_number: 'PO-001',
    contact_id: 'vendor-9',
    currency: 'CHF',
    total_amount: 550,
    tax_amount: 38.5,
    date: '2024-01-15',
    status: 'active',
    line_items: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (sunrise)', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('sunrise-po-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('vendor-9')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(550)
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('CHF')
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

  it('maps line_items to lineItems', () => {
    const raw = makePurchaseOrder({
      line_items: [
        {
          id: 'li-po-1',
          name: 'Paper',
          description: 'A4',
          quantity: 10,
          unit_price: 5,
          amount: 50,
          tax_amount: 3.5,
          account_id: 'acc-cost',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-po-1')
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(50)
    expect(li.taxAmount).toBe(3.5)
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
