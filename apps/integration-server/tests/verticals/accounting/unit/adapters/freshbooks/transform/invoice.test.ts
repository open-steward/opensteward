import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type FreshBooksInvoice,
  type FreshBooksLine,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/invoice'

function makeLine(overrides: Partial<FreshBooksLine> = {}): FreshBooksLine {
  return {
    lineid: 1,
    name: 'Widget',
    description: 'A fine widget',
    unit_cost: { amount: '50.00', code: 'USD' },
    qty: '2',
    taxName1: 'VAT',
    taxAmount1: '10',
    amount: { amount: '100.00', code: 'USD' },
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<FreshBooksInvoice> = {}): FreshBooksInvoice {
  return {
    id: 200,
    invoice_number: 'INV-2024-001',
    customerid: 55,
    create_date: '2024-03-01',
    due_date: '2024-03-31',
    currency_code: 'USD',
    amount: { amount: '1000.00', code: 'USD' },
    outstanding: { amount: '1000.00', code: 'USD' },
    paid: { amount: '0.00', code: 'USD' },
    status: 4,
    v3_status: 'sent',
    lines: [makeLine()],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id correctly (number to string)', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('200')
  })

  it('maps invoice_number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps customerid to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('55')
  })

  it('maps currency_code to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('parses amount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1000)
  })

  it('parses outstanding to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(1000)
  })

  it('parses paid to paidAmount', () => {
    expect(transformInvoice(makeInvoice()).paidAmount).toBe(0)
  })

  it('parses create_date as Date object for postedAt', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses due_date as Date object for dueAt', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-03-31'))
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps status 1 to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 1 })).status).toBe('DRAFT')
  })

  it('maps status 2 to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 2 })).status).toBe('AUTHORIZED')
  })

  it('maps status 4 to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 4 })).status).toBe('AUTHORIZED')
  })

  it('maps status 5 to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 5 })).status).toBe('AUTHORIZED')
  })

  it('maps status 6 to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 6 })).status).toBe('AUTHORIZED')
  })

  it('maps status 7 to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ status: 7 })).status).toBe('OVERDUE')
  })

  it('maps status 8 to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 8 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status 9 to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 9 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status 10 to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 10 })).status).toBe('PAID')
  })

  it('maps status 11 to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 11 })).status).toBe('PAID')
  })

  it('maps status 12 to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 12 })).status).toBe('VOIDED')
  })

  it('maps line items correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].totalAmount).toBe(100)
    expect(result.lineItems![0].unitQuantity).toBe(2)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
