import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type SinaoInvoice } from '../../../../../../../src/verticals/accounting/adapters/sinao/transform/invoice'

function makeInvoice(overrides: Partial<SinaoInvoice> = {}): SinaoInvoice {
  return {
    id: '1',
    number: 'INV-2024-001',
    date: '2024-01-15',
    due_date: '2024-02-15',
    amount_excl_tax: 1000,
    tax_amount: 200,
    amount_incl_tax: 1200,
    balance: 1200,
    status: 'draft',
    contact_id: 'contact_1',
    currency: 'EUR',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('contact_1')
    expect(result.totalAmount).toBe(1200)
    expect(result.taxAmount).toBe(200)
    expect(result.balanceAmount).toBe(1200)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps sent to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 1,
          description: 'Consulting',
          unit_price: 500,
          quantity: 2,
          amount_excl_tax: 1000,
          tax_amount: 200,
          account_id: '706000',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(200)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
