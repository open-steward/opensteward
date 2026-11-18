import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type APInvoice,
  type APInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/accountsportal/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeAPInvoiceLine(overrides: Partial<APInvoiceLine> = {}): APInvoiceLine {
  return {
    id: 1,
    account_id: 4000,
    description: 'Consulting',
    quantity: 2,
    unit_price: 500.0,
    net_amount: 1000.0,
    tax_rate_id: 5,
    tax_amount: 200.0,
    total_amount: 1200.0,
    ...overrides,
  }
}

function makeAPInvoice(overrides: Partial<APInvoice> = {}): APInvoice {
  return {
    id: 100,
    invoice_number: 'INV-100',
    contact_id: 50,
    currency: 'GBP',
    issue_date: '2024-02-01',
    due_date: '2024-03-03',
    status: 'paid',
    net_amount: 1000.0,
    tax_amount: 200.0,
    total_amount: 1200.0,
    paid_amount: 1200.0,
    balance: 0,
    reference: 'PO-ACME',
    notes: 'Thank you',
    invoice_lines: [makeAPInvoiceLine()],
    created_at: '2024-02-01T00:00:00.000Z',
    updated_at: '2024-02-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformInvoice (accountsportal)', () => {
  it('maps id as string', () => {
    expect(transformInvoice(makeAPInvoice({ id: 100 })).id).toBe('100')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeAPInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice_number', () => {
    expect(transformInvoice(makeAPInvoice()).invoiceNumber).toBe('INV-100')
  })

  it('prefixes contactId with c_', () => {
    expect(transformInvoice(makeAPInvoice({ contact_id: 50 })).contactId).toBe('c_50')
  })

  it('converts total_amount to minor units', () => {
    expect(transformInvoice(makeAPInvoice({ total_amount: 1200.0 })).totalAmount).toBe(120000)
  })

  it('converts tax_amount to minor units', () => {
    expect(transformInvoice(makeAPInvoice({ tax_amount: 200.0 })).taxAmount).toBe(20000)
  })

  it('converts paid_amount to minor units', () => {
    expect(transformInvoice(makeAPInvoice({ paid_amount: 1200.0 })).paidAmount).toBe(120000)
  })

  it('converts balance to minor units as balanceAmount', () => {
    expect(transformInvoice(makeAPInvoice({ balance: 0 })).balanceAmount).toBe(0)
  })

  it('maps "paid" status to PAID', () => {
    expect(transformInvoice(makeAPInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps "part_paid" to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeAPInvoice({ status: 'part_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps "void" to VOIDED', () => {
    expect(transformInvoice(makeAPInvoice({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps "draft" to DRAFT', () => {
    expect(transformInvoice(makeAPInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps "sent" to AUTHORIZED', () => {
    expect(transformInvoice(makeAPInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps reference and notes', () => {
    const result = transformInvoice(makeAPInvoice())
    expect(result.reference).toBe('PO-ACME')
    expect(result.notes).toBe('Thank you')
  })

  it('maps issue_date to postedAt and due_date to dueAt', () => {
    const result = transformInvoice(makeAPInvoice())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.dueAt).toBeInstanceOf(Date)
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformInvoice(makeAPInvoice())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps invoice_lines with minor-unit conversion', () => {
    const result = transformInvoice(makeAPInvoice())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.accountId).toBe('4000')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(50000) // 500.0 * 100
    expect(li.unitQuantity).toBe(2)
    expect(li.taxAmount).toBe(20000) // 200.0 * 100
    expect(li.taxrateId).toBe('5')
    expect(li.totalAmount).toBe(120000) // 1200.0 * 100
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoice(makeAPInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  describe('untransformInvoice', () => {
    it('strips c_ prefix from contactId', () => {
      const invoice = transformInvoice(makeAPInvoice())
      const back = untransformInvoice(invoice)
      expect(back.contact_id).toBe(50)
    })

    it('round-trips invoiceNumber, currency, reference, notes', () => {
      const invoice = transformInvoice(makeAPInvoice())
      const back = untransformInvoice(invoice)
      expect(back.invoice_number).toBe('INV-100')
      expect(back.currency).toBe('GBP')
      expect(back.reference).toBe('PO-ACME')
      expect(back.notes).toBe('Thank you')
    })

    it('converts issue_date back to YYYY-MM-DD string', () => {
      const invoice = transformInvoice(makeAPInvoice())
      const back = untransformInvoice(invoice)
      expect(back.issue_date).toBe('2024-02-01')
    })

    it('converts unit_price back to decimal from minor units', () => {
      const invoice = transformInvoice(makeAPInvoice())
      const back = untransformInvoice(invoice)
      const line = (back.invoice_lines as Array<Record<string, unknown>>)[0]
      // unitAmount 50000 / 100 = 500
      expect(line.unit_price).toBe(500)
    })

    it('recovers tax_rate_id as number', () => {
      const invoice = transformInvoice(makeAPInvoice())
      const back = untransformInvoice(invoice)
      const line = (back.invoice_lines as Array<Record<string, unknown>>)[0]
      expect(line.tax_rate_id).toBe(5)
    })
  })
})
