import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type DatevInvoice } from '../../../../../../../src/verticals/accounting/adapters/datev/transform/invoice'

function makeInvoice(overrides: Partial<DatevInvoice> = {}): DatevInvoice {
  return {
    id: 'inv-001',
    voucher_number: 'INV-001',
    voucher_date: '2024-03-01',
    due_date: '2024-03-31',
    total_gross_amount: 11900,
    total_tax_amount: 1900,
    total_net_amount: 10000,
    open_amount: 11900,
    currency_code: 'EUR',
    debitor_id: 'deb-1',
    voucher_status: 'Open',
    line_items: [],
    ...overrides,
  }
}

describe('transformInvoice (DATEV)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.contactId).toBe('deb-1')
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

  it('maps Open status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ voucher_status: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('maps Payed status to PAID', () => {
    expect(transformInvoice(makeInvoice({ voucher_status: 'Payed' })).status).toBe('PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ voucher_status: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ voucher_status: 'Draft' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
