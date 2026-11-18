import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type AccountsIQInvoice } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/invoice'

function makeInvoice(overrides: Partial<AccountsIQInvoice> = {}): AccountsIQInvoice {
  return {
    invoiceId: '1001',
    entityId: '10',
    status: 'Draft',
    invoiceNumber: 'INV-2024-001',
    invoiceDate: '2024-03-01',
    dueDate: '2024-03-31',
    totalAmount: 1210,
    taxAmount: 210,
    currency: 'EUR',
    contactId: '50',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('50')
    expect(result.totalAmount).toBe(1210)
    expect(result.taxAmount).toBe(210)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses invoiceDate as postedAt Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses dueDate as dueAt Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Posted status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'Posted' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'Paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'Cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps invoice lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [
        {
          lineId: 10,
          description: 'Consulting services',
          quantity: 3,
          unitPrice: 350,
          lineAmount: 1050,
          taxAmount: 210,
          accountCode: '4100',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('10')
    expect(li.itemDescription).toBe('Consulting services')
    expect(li.unitAmount).toBe(350)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(1050)
    expect(li.taxAmount).toBe(210)
    expect(li.accountId).toBe('4100')
  })

  it('returns empty lineItems array when lines is absent', () => {
    const result = transformInvoice(makeInvoice({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
