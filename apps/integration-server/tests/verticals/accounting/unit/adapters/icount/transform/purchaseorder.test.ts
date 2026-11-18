import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/purchaseorder'
import type { ICountInvoice } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/invoice'

function makeInvoice(overrides: Partial<ICountInvoice> = {}): ICountInvoice {
  return {
    doc_id: 'po_40',
    doc_type: 'purchaseorder',
    status: 'draft',
    sum: 3500,
    vat_sum: 595,
    currency_code: 'ILS',
    client_id: 'sup_8',
    date: '2024-03-18',
    doc_number: 'PO-40',
    ...overrides,
  }
}

describe('transformPurchaseOrder (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeInvoice())
    expect(result.id).toBe('po_40')
    expect(result.contactId).toBe('sup_8')
    expect(result.totalAmount).toBe(3500)
    expect(result.currency).toBe('ILS')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-18'))
  })

  it('maps status draft to DRAFT', () => {
    const result = transformPurchaseOrder(makeInvoice({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status open to ACTIVE', () => {
    const result = transformPurchaseOrder(makeInvoice({ status: 'open' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status paid to COMPLETED', () => {
    const result = transformPurchaseOrder(makeInvoice({ status: 'paid' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    const result = transformPurchaseOrder(makeInvoice({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeInvoice())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
