import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type BillinInvoice } from '../../../../../../../src/verticals/accounting/adapters/billin/transform/invoice'

function makeInvoice(overrides: Partial<BillinInvoice> = {}): BillinInvoice {
  return {
    id: 'inv-001',
    invoice_number: 'F-2024-001',
    issue_date: '2024-01-15',
    due_date: '2024-02-15',
    subtotal: 8000,
    tax_amount: 1680,
    total: 9680,
    remaining: 9680,
    status: 'draft',
    client_id: 'cli-001',
    currency: 'EUR',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (billin)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('F-2024-001')
    expect(result.contactId).toBe('cli-001')
    expect(result.totalAmount).toBe(9680)
    expect(result.taxAmount).toBe(1680)
    expect(result.balanceAmount).toBe(9680)
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
      lines: [{ id: 1, description: 'Service X', unit_price: 200, quantity: 2, total: 400, tax_amount: 84, account: '705' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(400)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
