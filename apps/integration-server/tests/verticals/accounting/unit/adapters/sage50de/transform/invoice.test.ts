import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type Sage50DeInvoice } from '../../../../../../../src/verticals/accounting/adapters/sage50de/transform/invoice'

function makeInvoice(overrides: Partial<Sage50DeInvoice> = {}): Sage50DeInvoice {
  return {
    id: 'inv-001',
    displayed_as: 'SI-001',
    date: '2024-03-01',
    due_date: '2024-03-31',
    net_amount: 10000,
    tax_amount: 1900,
    total_amount: 11900,
    outstanding_amount: 11900,
    status: 'OPEN',
    currency: { id: 'EUR' },
    contact: { id: 'cust-1', displayed_as: 'Muster AG' },
    line_items: [],
    ...overrides,
  }
}

describe('transformInvoice (Sage 50 DE)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('SI-001')
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
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps OPEN to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'OPEN' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps VOID to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'VOID' })).status).toBe('VOIDED')
  })

  it('maps DRAFT to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
