import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type SiigoInvoice } from '../../../../../../../src/verticals/accounting/adapters/siigo/transform/invoice'

function makeInvoice(overrides: Partial<SiigoInvoice> = {}): SiigoInvoice {
  return {
    id: 800,
    prefix: 'FV',
    number: 2000,
    name: 'Sales Invoice',
    date: '2025-04-01',
    dueDate: '2025-05-01',
    customerId: 300,
    total: 20000,
    taxTotal: 3800,
    balance: 10000,
    paidAmount: 10000,
    currency: 'COP',
    status: 'paid',
    items: [
      { id: 1, description: 'Service', quantity: 4, price: 5000, total: 20000, taxAmount: 3800, accountId: 20, productId: 'SVC-1', discount: 0 },
    ],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('800')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('FV-2000')
    expect(result.contactId).toBe('300')
    expect(result.currency).toBe('COP')
    expect(result.totalAmount).toBe(20000)
    expect(result.taxAmount).toBe(3800)
    expect(result.balanceAmount).toBe(10000)
    expect(result.paidAmount).toBe(10000)
  })

  it('maps status values', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
    expect(transformInvoice(makeInvoice({ status: 'voided' })).status).toBe('VOIDED')
    expect(transformInvoice(makeInvoice({ status: 'annulled' })).status).toBe('VOIDED')
    expect(transformInvoice(makeInvoice({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
    expect(transformInvoice(makeInvoice({ status: 'authorized' })).status).toBe('AUTHORIZED')
    expect(transformInvoice(makeInvoice({ status: '' })).status).toBe('DRAFT')
  })

  it('maps dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2025-04-01'))
    expect(result.dueAt).toEqual(new Date('2025-05-01'))
  })

  it('maps line items', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].itemId).toBe('SVC-1')
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
