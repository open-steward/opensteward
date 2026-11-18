import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type AlegraInvoice } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/invoice'

function makeInvoice(overrides: Partial<AlegraInvoice> = {}): AlegraInvoice {
  return {
    id: 50,
    numberTemplate: { number: '100', prefix: 'FV-' },
    date: '2024-01-15',
    dueDate: '2024-02-15',
    clientId: 3,
    total: 10000,
    totalTax: 1600,
    balance: 10000,
    paidAmount: 0,
    currency: 'COP',
    status: 'open',
    observations: '',
    items: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id to string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('50')
  })

  it('maps numberTemplate to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('FV-100')
  })

  it('maps clientId to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('3')
  })

  it('maps amounts', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.totalAmount).toBe(10000)
    expect(result.taxAmount).toBe(1600)
    expect(result.balanceAmount).toBe(10000)
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps status DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED for open', () => {
    expect(transformInvoice(makeInvoice({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED for void', () => {
    expect(transformInvoice(makeInvoice({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps status OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('maps observations to notes', () => {
    expect(transformInvoice(makeInvoice({ observations: 'Please pay on time' })).notes).toBe('Please pay on time')
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
