import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type BexioPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<BexioPurchaseOrder> = {}): BexioPurchaseOrder {
  return {
    id: 202,
    document_nr: 'PO-202',
    contact_id: 8,
    currency_id: 1,
    currency_code: 'CHF',
    is_valid_from: '2024-01-15',
    kb_item_status: 'open',
    total_gross: 4000,
    total_taxes: 300,
    positions: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id to string id', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('202')
  })

  it('maps contact_id to contactId as string', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.contactId).toBe('8')
  })

  it('maps currency_code to currency', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.currency).toBe('CHF')
  })

  it('maps total_gross to totalAmount', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.totalAmount).toBe(4000)
  })

  it('parses is_valid_from as Date', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps open status to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ kb_item_status: 'open' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ kb_item_status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps done status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ kb_item_status: 'done' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps received status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ kb_item_status: 'received' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ kb_item_status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ kb_item_status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps positions to lineItems', () => {
    const raw = makePurchaseOrder({
      positions: [
        {
          id: '20',
          article_id: 'art-2',
          text: 'Part B',
          amount: 10,
          unit_price: 50,
          position_total: 500,
          tax_id: 'vat-2',
          tax_value: 40,
          account_id: 'acc-60',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('20')
    expect(li.itemId).toBe('art-2')
    expect(li.itemDescription).toBe('Part B')
    expect(li.unitAmount).toBe(50)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(40)
    expect(li.taxrateId).toBe('vat-2')
    expect(li.accountId).toBe('acc-60')
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
