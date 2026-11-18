import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type NetvisorInvoice,
  type NetvisorInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/invoice'

function makeInvoiceLine(overrides: Partial<NetvisorInvoiceLine> = {}): NetvisorInvoiceLine {
  return {
    NetvisorKey: 501,
    ProductIdentifier: 'PROD-1',
    ProductName: 'Consulting Service',
    Quantity: 10,
    UnitPrice: 100,
    LineSum: 1000,
    VatPercent: 24,
    AccountNumber: '3000',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<NetvisorInvoice> = {}): NetvisorInvoice {
  return {
    NetvisorKey: 12345,
    InvoiceNumber: 1001,
    InvoiceCustomerIdentifier: 'CUST-1',
    InvoiceCurrency: 'EUR',
    InvoiceDate: '2024-03-15',
    InvoiceDueDate: '2024-04-15',
    InvoiceAmount: 12400,
    InvoiceVatAmount: 2400,
    InvoiceOpenAmount: 12400,
    InvoicePaidAmount: 0,
    InvoiceStatus: 'Open',
    InvoiceLines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps NetvisorKey to id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('12345')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps InvoiceNumber to invoiceNumber as string', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('1001')
  })

  it('maps InvoiceCustomerIdentifier to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('CUST-1')
  })

  it('maps InvoiceCurrency to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('EUR')
  })

  it('maps InvoiceAmount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(12400)
  })

  it('maps InvoiceVatAmount to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(2400)
  })

  it('maps InvoiceOpenAmount to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(12400)
  })

  it('maps InvoiceDate to postedAt as Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps InvoiceDueDate to dueAt as Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when InvoiceDate is empty', () => {
    expect(transformInvoice(makeInvoice({ InvoiceDate: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined contactId when InvoiceCustomerIdentifier is empty', () => {
    expect(
      transformInvoice(makeInvoice({ InvoiceCustomerIdentifier: '' })).contactId,
    ).toBeUndefined()
  })

  it('maps status Open to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ InvoiceStatus: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('maps status Overdue to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ InvoiceStatus: 'Overdue' })).status).toBe('AUTHORIZED')
  })

  it('maps status Paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ InvoiceStatus: 'Paid' })).status).toBe('PAID')
  })

  it('maps status Unsent to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ InvoiceStatus: 'Unsent' })).status).toBe('DRAFT')
  })

  it('maps status Credited to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ InvoiceStatus: 'Credited' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ InvoiceStatus: 'Unknown' })).status).toBe('DRAFT')
  })

  it('maps InvoiceLines to lineItems', () => {
    const raw = makeInvoice({ InvoiceLines: [makeInvoiceLine()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('501')
    expect(li.itemId).toBe('PROD-1')
    expect(li.itemDescription).toBe('Consulting Service')
    expect(li.unitQuantity).toBe(10)
    expect(li.unitAmount).toBe(100)
    expect(li.totalAmount).toBe(1000)
    expect(li.accountId).toBe('3000')
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
