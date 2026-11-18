import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type DebitoorInvoice } from '../../../../../../../src/verticals/accounting/adapters/debitoor/transform/invoice'

function makeInvoice(overrides: Partial<DebitoorInvoice> = {}): DebitoorInvoice {
  return {
    id: 'inv-001',
    invoiceNumber: 'INV-2024-001',
    date: '2024-01-15',
    dueDate: '2024-02-15',
    netAmount: 8000,
    taxAmount: 1680,
    grossAmount: 9680,
    outstandingAmount: 9680,
    status: 'draft',
    customerId: 'cust-001',
    currency: 'EUR',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (debitoor)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('cust-001')
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

  it('maps void to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [{ id: 'li-1', productName: 'Consulting', unitNetPrice: 200, quantity: 4, netAmount: 800, taxAmount: 168, accountId: '705' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(800)
    expect(result.lineItems![0].taxAmount).toBe(168)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
