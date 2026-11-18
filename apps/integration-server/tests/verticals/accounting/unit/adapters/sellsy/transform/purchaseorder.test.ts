import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type SellsyPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/sellsy/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<SellsyPurchaseOrder> = {}): SellsyPurchaseOrder {
  return {
    id: 'sellsy-po-1',
    number: 'PO-001',
    contact_id: 'vendor-3',
    currency: 'EUR',
    date: '2024-01-15',
    status: 'active',
    total_amount: 600,
    tax_amount: 120,
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (sellsy)', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('sellsy-po-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('vendor-3')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(600)
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('EUR')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status received to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'completed' })).status).toBe('COMPLETED')
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

  it('maps lines to lineItems', () => {
    const raw = makePurchaseOrder({
      lines: [
        {
          id: 'line-po-1',
          product_id: 'mat-3',
          description: 'Steel',
          quantity: 5,
          unit_amount: 20,
          total_amount: 100,
          tax_amount: 20,
          account_id: 'acc-cost',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-po-1')
    expect(li.itemId).toBe('mat-3')
    expect(li.totalAmount).toBe(100)
    expect(li.taxAmount).toBe(20)
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
