import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type InvoiceXpressPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<InvoiceXpressPurchaseOrder> = {}): InvoiceXpressPurchaseOrder {
  return {
    id: 600,
    date: '2024-09-01',
    supplier: { id: 15 },
    total: 2400,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('600')
    expect(result.contactId).toBe('15')
    expect(result.totalAmount).toBe(2400)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-09-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder({ total: 3000 })
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined contactId when supplier.id is 0', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ supplier: { id: 0 } }))
    expect(result.contactId).toBeUndefined()
  })

  it('returns undefined postedAt when date is empty', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('returns undefined currency when empty', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ currency: '' }))
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
