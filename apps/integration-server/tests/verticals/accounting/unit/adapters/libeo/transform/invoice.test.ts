import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type LibeoInvoice } from '../../../../../../../src/verticals/accounting/adapters/libeo/transform/invoice'

function makeInvoice(overrides: Partial<LibeoInvoice> = {}): LibeoInvoice {
  return {
    id: '10',
    reference: 'REF-2024-010',
    issued_at: '2024-01-15',
    due_at: '2024-02-15',
    net_amount: 1000,
    vat_amount: 200,
    total_amount: 1200,
    remaining_amount: 1200,
    state: 'draft',
    contact_id: 'contact_5',
    currency: 'EUR',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('10')
    expect(result.invoiceNumber).toBe('REF-2024-010')
    expect(result.contactId).toBe('contact_5')
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
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ state: 'draft' })).status).toBe('DRAFT')
  })

  it('maps approved to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ state: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ state: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ state: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [{ id: 1, description: 'Service', unit_price: 500, quantity: 2, net_amount: 1000, vat_amount: 200, account_id: '706000' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(1000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
