import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FreeAgentInvoice } from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/invoice'

function makeInvoice(overrides: Partial<FreeAgentInvoice> = {}): FreeAgentInvoice {
  return {
    url: 'https://api.freeagent.com/v2/invoices/42',
    contact: 'https://api.freeagent.com/v2/contacts/10',
    project: '',
    invoice_number: 'INV-042',
    reference: 'PO-2024-001',
    dated_on: '2024-01-15',
    payment_terms_in_days: 30,
    currency: 'GBP',
    net_value: '1000.00',
    total_value: '1200.00',
    paid_value: '0.00',
    due_value: '1200.00',
    status: 'Sent',
    ...overrides,
  }
}

describe('transformInvoice (FreeAgent)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('42')
    expect(result.invoiceNumber).toBe('INV-042')
    expect(result.contactId).toBe('10')
    expect(result.currency).toBe('GBP')
    expect(result.totalAmount).toBe(1200)
    expect(result.balanceAmount).toBe(1200)
    expect(result.paidAmount).toBeUndefined()
    expect(result.reference).toBe('PO-2024-001')
    expect(result.type).toBe('INVOICE')
  })

  it('extracts ID from URL correctly', () => {
    const result = transformInvoice(makeInvoice({ url: 'https://api.freeagent.com/v2/invoices/999' }))
    expect(result.id).toBe('999')
  })

  it('maps Draft status', () => {
    expect(transformInvoice(makeInvoice({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Sent to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Sent' })).status).toBe('AUTHORIZED')
  })

  it('maps Overdue correctly', () => {
    expect(transformInvoice(makeInvoice({ status: 'Overdue' })).status).toBe('OVERDUE')
  })

  it('maps Partly Paid to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'Partly Paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps Paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'Paid', due_value: '0.00', paid_value: '1200.00' })).status).toBe('PAID')
  })

  it('maps Void to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Void' })).status).toBe('VOIDED')
  })

  it('computes dueAt from postedAt + payment_terms_in_days', () => {
    const result = transformInvoice(makeInvoice({ dated_on: '2024-01-15', payment_terms_in_days: 30 }))
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    // 30 days after 2024-01-15 = 2024-02-14
    expect(result.dueAt).toBeDefined()
    expect(expectDate(result.dueAt).getTime()).toBe(new Date('2024-01-15').getTime() + 30 * 86400 * 1000)
  })

  it('passes raw object through as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
