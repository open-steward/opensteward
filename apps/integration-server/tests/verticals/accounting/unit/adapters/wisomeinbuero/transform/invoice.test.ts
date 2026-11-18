import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type WisoInvoice } from '../../../../../../../src/verticals/accounting/adapters/wisomeinbuero/transform/invoice'

function makeInvoice(overrides: Partial<WisoInvoice> = {}): WisoInvoice {
  return {
    id: 'inv-001',
    invoiceNumber: 'RE-001',
    invoiceDate: '2024-03-01',
    dueDate: '2024-03-31',
    netAmount: 10000,
    vatAmount: 1900,
    grossAmount: 11900,
    openAmount: 11900,
    status: 'SENT',
    currencyCode: 'EUR',
    customerId: 'cust-1',
    lineItems: [],
    ...overrides,
  }
}

describe('transformInvoice (WISO MeinBüro)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('RE-001')
    expect(result.contactId).toBe('cust-1')
    expect(result.totalAmount).toBe(11900)
    expect(result.taxAmount).toBe(1900)
    expect(result.balanceAmount).toBe(11900)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps SENT to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'SENT' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps CANCELLED to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps DRAFT to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
