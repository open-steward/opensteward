import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type PennylaneInvoice,
  type PennylaneLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/invoice'

function makeLineItem(overrides: Partial<PennylaneLineItem> = {}): PennylaneLineItem {
  return {
    id: 'li-1',
    description: 'Consulting',
    quantity: 2,
    unit_amount: 500,
    amount: 1000,
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<PennylaneInvoice> = {}): PennylaneInvoice {
  return {
    id: 'inv-1',
    invoice_number: 'INV-2024-001',
    customer: { source_id: 'cust-1', name: 'Client Ltd' },
    date: '2024-06-01',
    deadline: '2024-06-30',
    currency: 'EUR',
    amount: 1000,
    amount_cents: 100000,
    remaining_amount: 1000,
    paid_at: null,
    status: 'sent',
    line_items: [makeLineItem()],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id correctly', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-1')
  })

  it('maps invoice_number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps customer source_id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust-1')
  })

  it('returns undefined contactId when customer is null', () => {
    expect(transformInvoice(makeInvoice({ customer: null })).contactId).toBeUndefined()
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps currency correctly', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1000)
  })

  it('maps remaining_amount to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(1000)
  })

  it('parses date as Date object', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('parses deadline as Date object', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-06-30'))
  })

  it('parses paid_at as Date object when set', () => {
    expect(transformInvoice(makeInvoice({ paid_at: '2024-06-15' })).paidAt).toEqual(new Date('2024-06-15'))
  })

  it('returns undefined paidAt when paid_at is null', () => {
    expect(transformInvoice(makeInvoice({ paid_at: null })).paidAt).toBeUndefined()
  })

  it('maps status draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status not_sent to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'not_sent' })).status).toBe('AUTHORIZED')
  })

  it('maps status sent to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps status received to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'received' })).status).toBe('AUTHORIZED')
  })

  it('maps status partially_paid to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status cancelled to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps line_items to lineItems', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].id).toBe('li-1')
    expect(result.lineItems?.[0].itemDescription).toBe('Consulting')
    expect(result.lineItems?.[0].unitAmount).toBe(500)
    expect(result.lineItems?.[0].unitQuantity).toBe(2)
    expect(result.lineItems?.[0].totalAmount).toBe(1000)
  })

  it('produces empty lineItems array when line_items is absent', () => {
    expect(transformInvoice(makeInvoice({ line_items: undefined })).lineItems).toEqual([])
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
