import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type QuipuInvoice } from '../../../../../../../src/verticals/accounting/adapters/quipu/transform/invoice'

function makeInvoice(overrides: Partial<QuipuInvoice> = {}): QuipuInvoice {
  return {
    id: 'inv-001',
    number: 'F-2024-001',
    issued_at: '2024-01-15',
    due_at: '2024-02-15',
    amount_without_taxes: 8000,
    taxes_amounts: 1680,
    total_amount: 9680,
    unpaid_amount: 9680,
    payment_status: 'draft',
    contact_id: 'con-001',
    currency: 'EUR',
    items: [],
    ...overrides,
  }
}

describe('transformInvoice (quipu)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('F-2024-001')
    expect(result.contactId).toBe('con-001')
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
    expect(transformInvoice(makeInvoice({ payment_status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps outstanding to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ payment_status: 'outstanding' })).status).toBe('AUTHORIZED')
  })

  it('maps paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ payment_status: 'paid' })).status).toBe('PAID')
  })

  it('maps overdue to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ payment_status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps items to lineItems', () => {
    const raw = makeInvoice({
      items: [{ id: 1, concept: 'Consultoría', unitary_amount: 100, quantity: 5, total_amount: 500, taxes_amounts: 105, account_id: '705' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(500)
    expect(result.lineItems![0].taxAmount).toBe(105)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
