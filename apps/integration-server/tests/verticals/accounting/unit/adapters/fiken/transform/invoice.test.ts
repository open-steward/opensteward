import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type FikenInvoice,
  type FikenInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/invoice'

function makeInvoiceLine(overrides: Partial<FikenInvoiceLine> = {}): FikenInvoiceLine {
  return {
    netPrice: 800,
    vatAmount: 200,
    grossPrice: 1000,
    description: 'Consulting service',
    productId: 42,
    quantity: 2,
    unitPrice: 500,
    vatType: 'HIGH',
    accountCode: '3000',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<FikenInvoice> = {}): FikenInvoice {
  return {
    invoiceId: 101,
    invoiceNumber: 'INV-1001',
    customerId: 55,
    customerName: 'Acme AS',
    currency: 'NOK',
    net: 8000,
    vat: 2000,
    gross: 10000,
    issueDate: '2024-06-01',
    dueDate: '2024-07-01',
    paid: false,
    settled: false,
    invoiceDraftLines: [],
    kid: '12345',
    bankAccountNumber: '1234.56.78901',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps invoiceId to id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('101')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-1001')
  })

  it('maps customerId to contactId as string', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('55')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('NOK')
  })

  it('maps gross to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(10000)
  })

  it('maps vat to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(2000)
  })

  it('maps issueDate to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-06-01'))
  })

  it('maps dueDate to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-07-01'))
  })

  it('returns undefined postedAt when issueDate is empty', () => {
    expect(transformInvoice(makeInvoice({ issueDate: '' })).postedAt).toBeUndefined()
  })

  it('maps status AUTHORIZED when not paid and not settled', () => {
    expect(
      transformInvoice(makeInvoice({ paid: false, settled: false })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when settled', () => {
    expect(
      transformInvoice(makeInvoice({ settled: true })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when paid but not settled', () => {
    expect(
      transformInvoice(makeInvoice({ paid: true, settled: false })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps invoiceDraftLines to lineItems', () => {
    const raw = makeInvoice({
      invoiceDraftLines: [makeInvoiceLine()],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('42')
    expect(li.itemDescription).toBe('Consulting service')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(200)
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
