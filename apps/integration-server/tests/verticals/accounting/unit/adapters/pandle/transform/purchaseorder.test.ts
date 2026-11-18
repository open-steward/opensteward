import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type PandlePurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<PandlePurchaseOrder> = {}): PandlePurchaseOrder {
  return {
    id: 201,
    order_number: 'PO-201',
    supplier_id: 77,
    currency: 'GBP',
    issue_date: '2024-01-15',
    status: 'active',
    net_amount: 400,
    tax_amount: 80,
    total_amount: 480,
    reference: 'PREF-001',
    order_lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (pandle)', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('201')
  })

  it('maps supplier_id to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('77')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(480)
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('GBP')
  })

  it('maps issue_date to postedAt as Date', () => {
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

  it('maps status voided to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'voided' })).status).toBe('CANCELLED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps order_lines to lineItems', () => {
    const raw = makePurchaseOrder({
      order_lines: [
        {
          id: 301,
          account_id: 4000,
          description: 'Steel',
          quantity: 10,
          unit_price: 20,
          net_amount: 200,
          tax_rate_id: 3,
          tax_amount: 20,
          total_amount: 220,
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('301')
    expect(li.accountId).toBe('4000')
    expect(li.itemDescription).toBe('Steel')
    expect(li.unitAmount).toBe(20)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(220)
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
