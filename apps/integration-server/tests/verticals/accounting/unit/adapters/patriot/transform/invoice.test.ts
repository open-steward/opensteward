import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type PatriotInvoice,
  type PatriotInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/patriot/transform/invoice'

function makeInvoiceLine(overrides: Partial<PatriotInvoiceLine> = {}): PatriotInvoiceLine {
  return {
    id: 'line-1',
    description: 'Consulting services',
    quantity: 3,
    rate: 100,
    amount: 300,
    tax_amount: 24,
    account_id: 'acc-1',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<PatriotInvoice> = {}): PatriotInvoice {
  return {
    id: 'inv-001',
    number: 'INV-2024-001',
    contact_id: 'contact-1',
    currency: 'USD',
    date: '2024-03-15',
    due_date: '2024-04-15',
    status: 'approved',
    total_amount: 9600,
    tax_amount: 1600,
    paid_amount: 0,
    remaining_amount: 9600,
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id from raw id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps contact_id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('contact-1')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(9600)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(1600)
  })

  it('maps remaining_amount to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(9600)
  })

  it('maps date to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps due_date to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformInvoice(makeInvoice({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when status is draft', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when approved with full remaining', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'approved', remaining_amount: 9600, paid_amount: 0 }))
        .status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when status is paid', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when partially_paid', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'partially_paid' })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when void', () => {
    expect(transformInvoice(makeInvoice({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({ lines: [makeInvoiceLine()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemDescription).toBe('Consulting services')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(300)
    expect(li.taxAmount).toBe(24)
    expect(li.accountId).toBe('acc-1')
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
