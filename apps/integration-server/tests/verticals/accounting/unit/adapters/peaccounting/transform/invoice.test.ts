import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type PEAccountingInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/peaccounting/transform/invoice'

function makeInvoice(overrides: Partial<PEAccountingInvoice> = {}): PEAccountingInvoice {
  return {
    id: 101,
    invoice_number: 'PE-001',
    invoice_date: '2024-05-01',
    due_date: '2024-05-31',
    currency: 'SEK',
    total: 12500,
    tax_amount: 2500,
    amount_due: 12500,
    status: 'sent',
    contact_id: 42,
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (PE Accounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('101')
    expect(result.invoiceNumber).toBe('PE-001')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(12500)
    expect(result.taxAmount).toBe(2500)
    expect(result.balanceAmount).toBe(12500)
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

  it('maps sent status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps overdue status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'overdue' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps voided status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'pending' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 1,
          description: 'Consulting',
          quantity: 5,
          unit_price: 1000,
          total: 5000,
          tax_amount: 1250,
          account_id: 3001,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(5000)
    expect(li.taxAmount).toBe(1250)
    expect(li.accountId).toBe('3001')
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformInvoice({ id: 999 })
    expect(result.id).toBe('999')
    expect(result.invoiceNumber).toBeUndefined()
    expect(result.contactId).toBeUndefined()
    expect(result.lineItems).toHaveLength(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
