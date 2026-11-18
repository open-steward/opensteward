import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type CalxaInvoice,
  type CalxaInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoiceLine(overrides: Partial<CalxaInvoiceLine> = {}): CalxaInvoiceLine {
  return {
    id: 'line-001',
    accountId: 'acct-4000',
    description: 'Widget service',
    unitAmount: 100,
    quantity: 2,
    lineAmount: 200,
    taxAmount: 20,
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<CalxaInvoice> = {}): CalxaInvoice {
  return {
    id: 'inv-001',
    invoiceNumber: 'INV-001',
    contactId: 'contact-42',
    status: 'authorised',
    currency: 'USD',
    total: 1200,
    totalTax: 120,
    amountDue: 1200,
    amountPaid: 0,
    reference: 'PO-999',
    date: '2024-03-15',
    dueDate: '2024-04-15',
    lineItems: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id as-is', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-001')
  })

  it('maps contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('contact-42')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1200)
  })

  it('maps totalTax to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(120)
  })

  it('maps amountDue to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(1200)
  })

  it('maps amountPaid to paidAmount', () => {
    expect(transformInvoice(makeInvoice()).paidAmount).toBe(0)
  })

  it('maps reference', () => {
    expect(transformInvoice(makeInvoice()).reference).toBe('PO-999')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when date is undefined', () => {
    expect(transformInvoice(makeInvoice({ date: undefined })).postedAt).toBeUndefined()
  })

  it('maps status authorised to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'authorised' })).status).toBe('AUTHORIZED')
  })

  it('maps status authorized to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'authorized' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status voided to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps status void to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps status deleted to DELETED', () => {
    expect(transformInvoice(makeInvoice({ status: 'deleted' })).status).toBe('DELETED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'pending' })).status).toBe('DRAFT')
  })

  it('maps lineItems to lineItems', () => {
    const raw = makeInvoice({ lineItems: [makeInvoiceLine()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-001')
    expect(li.accountId).toBe('acct-4000')
    expect(li.itemDescription).toBe('Widget service')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(200)
    expect(li.taxAmount).toBe(20)
  })

  it('maps empty lineItems to empty lineItems array', () => {
    expect(transformInvoice(makeInvoice({ lineItems: [] })).lineItems).toHaveLength(0)
  })

  it('maps undefined lineItems to empty lineItems array', () => {
    expect(transformInvoice(makeInvoice({ lineItems: undefined })).lineItems).toHaveLength(0)
  })

  it('maps createdAt to Date', () => {
    const result = transformInvoice(makeInvoice({ createdAt: '2024-01-15T09:30:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updatedAt to Date', () => {
    const result = transformInvoice(makeInvoice({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })
})
