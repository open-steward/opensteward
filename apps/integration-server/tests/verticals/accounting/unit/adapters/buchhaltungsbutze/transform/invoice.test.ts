import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type BuchhaltungsButzeInvoice } from '../../../../../../../src/verticals/accounting/adapters/buchhaltungsbutze/transform/invoice'

function makeInvoice(overrides: Partial<BuchhaltungsButzeInvoice> = {}): BuchhaltungsButzeInvoice {
  return {
    id: 'inv-001',
    receipt_no: 'RE-001',
    date: '2024-03-01',
    due_date: '2024-03-31',
    net: 10000,
    tax: 1900,
    gross: 11900,
    unpaid: 11900,
    status: 'open',
    currency: 'EUR',
    customer_id: 'cust-1',
    items: [],
    ...overrides,
  }
}

describe('transformInvoice (BuchhaltungsButze)', () => {
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
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps open to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
