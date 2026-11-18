import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type RegateInvoice } from '../../../../../../../src/verticals/accounting/adapters/regate/transform/invoice'

function makeInvoice(overrides: Partial<RegateInvoice> = {}): RegateInvoice {
  return {
    id: '20',
    invoice_number: 'INV-20',
    invoice_date: '2024-03-01',
    due_date: '2024-04-01',
    amount_excluding_tax: 2000,
    tax_amount: 400,
    total_amount: 2400,
    outstanding_amount: 2400,
    status: 'DRAFT',
    contact_id: 'c1',
    currency: 'EUR',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('20')
    expect(result.invoiceNumber).toBe('INV-20')
    expect(result.totalAmount).toBe(2400)
    expect(result.taxAmount).toBe(400)
    expect(result.balanceAmount).toBe(2400)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps DRAFT status', () => {
    expect(transformInvoice(makeInvoice({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps VALIDATED to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'VALIDATED' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps CANCELLED to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [{ id: 1, description: 'Dev', unit_price: 200, quantity: 10, amount_excluding_tax: 2000, tax_amount: 400, account_id: '706' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(2000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
