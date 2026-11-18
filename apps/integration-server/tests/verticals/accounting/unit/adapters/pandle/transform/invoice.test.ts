import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type PandleInvoice,
  type PandleInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/invoice'

function makeInvoiceLine(overrides: Partial<PandleInvoiceLine> = {}): PandleInvoiceLine {
  return {
    id: 101,
    account_id: 400,
    description: 'Web design services',
    quantity: 5,
    unit_price: 200,
    net_amount: 1000,
    tax_rate_id: 1,
    tax_amount: 200,
    total_amount: 1200,
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<PandleInvoice> = {}): PandleInvoice {
  return {
    id: 1001,
    invoice_number: 'INV-001',
    customer_id: 50,
    currency: 'GBP',
    issue_date: '2024-03-15',
    due_date: '2024-04-15',
    status: 'sent',
    net_amount: 1000,
    tax_amount: 200,
    total_amount: 1200,
    paid_amount: 0,
    balance: 1200,
    reference: 'PO-123',
    notes: 'Thank you',
    invoice_lines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id from raw id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('1001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice_number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-001')
  })

  it('maps customer_id to contactId as string', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('50')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('GBP')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1200)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(200)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(1200)
  })

  it('maps issue_date to postedAt as Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps due_date to dueAt as Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when issue_date is empty', () => {
    expect(transformInvoice(makeInvoice({ issue_date: '' })).postedAt).toBeUndefined()
  })

  it('maps status draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status sent to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status part_paid to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'part_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status void to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps invoice_lines to lineItems', () => {
    const raw = makeInvoice({ invoice_lines: [makeInvoiceLine()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('101')
    expect(li.accountId).toBe('400')
    expect(li.itemDescription).toBe('Web design services')
    expect(li.unitAmount).toBe(200)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(1200)
    expect(li.taxAmount).toBe(200)
    expect(li.taxrateId).toBe('1')
  })

  it('maps reference', () => {
    expect(transformInvoice(makeInvoice()).reference).toBe('PO-123')
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
