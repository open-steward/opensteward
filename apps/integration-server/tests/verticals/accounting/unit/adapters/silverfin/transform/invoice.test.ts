import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type SilverfinInvoice } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/invoice'

function makeInvoice(overrides: Partial<SilverfinInvoice> = {}): SilverfinInvoice {
  return {
    id: '2001',
    status: 'draft',
    invoice_number: 'INV-2024-001',
    period: '2024-03-01',
    due_date: '2024-03-31',
    total_amount: 1240,
    tax_amount: 240,
    currency: 'EUR',
    contact_id: '99',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('2001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('99')
    expect(result.totalAmount).toBe(1240)
    expect(result.taxAmount).toBe(240)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses period as postedAt Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses due_date as dueAt Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps approved status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'approved' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps invoice lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 10,
          description: 'Consulting',
          quantity: 2,
          unit_price: 500,
          total_amount: 1000,
          tax_amount: 240,
          account_id: '4000',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('10')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(240)
    expect(li.accountId).toBe('4000')
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
