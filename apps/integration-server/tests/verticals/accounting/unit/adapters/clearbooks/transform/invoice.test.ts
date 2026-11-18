import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ClearBooksInvoice } from '../../../../../../../src/verticals/accounting/adapters/clearbooks/transform/invoice'

function makeInvoice(overrides: Partial<ClearBooksInvoice> = {}): ClearBooksInvoice {
  return {
    invoice_id: '1001',
    invoice_number: 'INV-2024-001',
    entity_id: '42',
    date_created: '01/03/2024',
    date_due: '31/03/2024',
    total_gross: 1200,
    total_net: 1000,
    total_tax: 200,
    currency: 'GBP',
    status: 'unpaid',
    line_items: [],
    ...overrides,
  }
}

describe('transformInvoice (ClearBooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(1200)
    expect(result.taxAmount).toBe(200)
    expect(result.currency).toBe('GBP')
    expect(result.type).toBe('INVOICE')
  })

  it('parses UK date format DD/MM/YYYY as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice({ invoice_number: 'INV-SPECIAL' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps unpaid status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'unpaid' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps void status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'void' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'unknown_status' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps line items to lineItems', () => {
    const raw = makeInvoice({
      line_items: [
        {
          id: 10,
          description: 'Consulting',
          quantity: 2,
          unit_price: 500,
          total_net: 1000,
          tax_amount: 200,
          account_code: '4000',
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
    expect(li.taxAmount).toBe(200)
    expect(li.accountId).toBe('4000')
  })

  it('returns empty lineItems array when line_items is absent', () => {
    const raw = makeInvoice({ line_items: [] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('handles ISO date format as well', () => {
    const result = transformInvoice(makeInvoice({ date_created: '2024-03-01', date_due: '2024-03-31' }))
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('converts numeric invoice_id to string', () => {
    const result = transformInvoice(makeInvoice({ invoice_id: 9999 }))
    expect(result.id).toBe('9999')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
