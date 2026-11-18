import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type InbooksInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/inbooks/transform/invoice'

function makeInvoice(overrides: Partial<InbooksInvoice> = {}): InbooksInvoice {
  return {
    id: 301,
    invoice_number: 'IB-001',
    invoice_date: '2024-06-01',
    due_date: '2024-06-30',
    sub_total: 10000,
    tax_amount: 2500,
    total_amount: 12500,
    amount_due: 12500,
    status: 'Open',
    contact_id: 88,
    currency: 'SEK',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (Inbooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('301')
    expect(result.invoiceNumber).toBe('IB-001')
    expect(result.contactId).toBe('88')
    expect(result.totalAmount).toBe(12500)
    expect(result.taxAmount).toBe(2500)
    expect(result.balanceAmount).toBe(12500)
    expect(result.currency).toBe('SEK')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-06-01'))
    expect(result.dueAt).toEqual(new Date('2024-06-30'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Open status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Void status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Void' })).status).toBe('VOIDED')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 5,
          description: 'Design work',
          quantity: 4,
          rate: 750,
          amount: 3000,
          tax_amount: 750,
          account_id: 42,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('5')
    expect(li.itemDescription).toBe('Design work')
    expect(li.unitAmount).toBe(750)
    expect(li.unitQuantity).toBe(4)
    expect(li.totalAmount).toBe(3000)
    expect(li.taxAmount).toBe(750)
    expect(li.accountId).toBe('42')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
