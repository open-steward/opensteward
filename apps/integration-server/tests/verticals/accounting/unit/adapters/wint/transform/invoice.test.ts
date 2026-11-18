import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type WintInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/wint/transform/invoice'

function makeInvoice(overrides: Partial<WintInvoice> = {}): WintInvoice {
  return {
    id: 201,
    number: 'WI-201',
    contact_id: 55,
    date: '2024-05-01',
    due_date: '2024-05-31',
    currency: 'SEK',
    gross: 15000,
    vat: 3000,
    net: 12000,
    remaining: 15000,
    status: 'sent',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (Wint)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('201')
    expect(result.invoiceNumber).toBe('WI-201')
    expect(result.contactId).toBe('55')
    expect(result.totalAmount).toBe(15000)
    expect(result.taxAmount).toBe(3000)
    expect(result.balanceAmount).toBe(15000)
    expect(result.currency).toBe('SEK')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-05-01'))
    expect(result.dueAt).toEqual(new Date('2024-05-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps sent status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps overdue status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'overdue' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps line items to lineItems with correct field names', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 10,
          text: 'Web Development',
          qty: 8,
          price: 1500,
          amount: 12000,
          vat_amount: 3000,
          account: '3010',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('10')
    expect(li.itemDescription).toBe('Web Development')
    expect(li.unitAmount).toBe(1500)
    expect(li.unitQuantity).toBe(8)
    expect(li.totalAmount).toBe(12000)
    expect(li.taxAmount).toBe(3000)
    expect(li.accountId).toBe('3010')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
