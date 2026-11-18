import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type SageInvoice } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/invoice'

function makeRaw(overrides: Partial<SageInvoice> = {}): SageInvoice {
  return {
    id: 'INV-001',
    invoice_number: 'SI-0001',
    date: '2024-01-15',
    due_date: '2024-02-15',
    net_amount: 10000,
    tax_amount: 2000,
    total_amount: 12000,
    outstanding_amount: 12000,
    status: { id: 'DRAFT' },
    contact: { id: 'CONTACT-001' },
    currency: { id: 'GBP' },
    line_items: [],
    ...overrides,
  }
}

describe('transformInvoice (SageBusinessCloud)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('INV-001')
    expect(result.invoiceNumber).toBe('SI-0001')
    expect(result.contactId).toBe('CONTACT-001')
    expect(result.totalAmount).toBe(12000)
    expect(result.taxAmount).toBe(2000)
    expect(result.balanceAmount).toBe(12000)
    expect(result.currency).toBe('GBP')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps DRAFT status correctly', () => {
    expect(transformInvoice(makeRaw({ status: { id: 'DRAFT' } })).status).toBe('DRAFT')
  })

  it('maps SUBMITTED status to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: { id: 'SUBMITTED' } })).status).toBe('AUTHORIZED')
  })

  it('maps AUTHORISED status to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: { id: 'AUTHORISED' } })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status correctly', () => {
    expect(transformInvoice(makeRaw({ status: { id: 'PAID' } })).status).toBe('PAID')
  })

  it('maps VOID status to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: { id: 'VOID' } })).status).toBe('VOIDED')
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      line_items: [
        { id: 'LI-001', description: 'Consulting', quantity: 2, unit_price: 5000, net_amount: 10000, tax_amount: 2000, ledger_account: { id: 'ACC-001' } },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('LI-001')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(5000)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(10000)
    expect(li.taxAmount).toBe(2000)
    expect(li.accountId).toBe('ACC-001')
  })

  it('falls back to id when invoice_number is absent', () => {
    const result = transformInvoice(makeRaw({ invoice_number: undefined }))
    expect(result.invoiceNumber).toBe('INV-001')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
