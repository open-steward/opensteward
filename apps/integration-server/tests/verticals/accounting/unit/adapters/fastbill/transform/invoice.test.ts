import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FastBillInvoice } from '../../../../../../../src/verticals/accounting/adapters/fastbill/transform/invoice'

function makeInvoice(overrides: Partial<FastBillInvoice> = {}): FastBillInvoice {
  return {
    INVOICE_ID: 'inv-001',
    INVOICE_NUMBER: 'RE-001',
    INVOICE_DATE: '2024-03-01',
    DUE_DATE: '2024-03-31',
    TOTAL: 11900,
    VAT_AMOUNT: 1900,
    SUBTOTAL: 10000,
    OUTSTANDING_AMOUNT: 11900,
    INVOICE_STATUS: 'open',
    CURRENCY_CODE: 'EUR',
    CUSTOMER_ID: 'cust-1',
    ITEMS: [],
    ...overrides,
  }
}

describe('transformInvoice (FastBill)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('RE-001')
    expect(result.contactId).toBe('cust-1')
    expect(result.totalAmount).toBe(11900)
    expect(result.taxAmount).toBe(1900)
    expect(result.balanceAmount).toBe(11900)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps open status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ INVOICE_STATUS: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ INVOICE_STATUS: 'paid' })).status).toBe('PAID')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ INVOICE_STATUS: 'draft' })).status).toBe('DRAFT')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ INVOICE_STATUS: 'cancelled' })).status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
