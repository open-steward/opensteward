import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type TwinfieldInvoice,
  type TwinfieldInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/invoice'

function makeInvoiceLine(overrides: Partial<TwinfieldInvoiceLine> = {}): TwinfieldInvoiceLine {
  return {
    id: 'line-1',
    article: 'ART-100',
    description: 'Consulting services',
    quantity: 3,
    unitsPriceExcl: 200,
    valueExcl: 600,
    valueInc: 726,
    vatCode: 'VH',
    vatValue: 126,
    dim1: '8000',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<TwinfieldInvoice> = {}): TwinfieldInvoice {
  return {
    code: 'SINV-001',
    invoiceNumber: 'INV-2024-001',
    customer: 'DEB-001',
    currency: 'EUR',
    invoiceDate: '2024-06-01',
    dueDate: '2024-07-01',
    status: 'final',
    totalExcl: 5000,
    totalIncl: 6050,
    vatTotal: 1050,
    paidAmount: 0,
    balance: 6050,
    headerText: 'Q2 services',
    lines: [],
    office: 'NL001',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps code to id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('SINV-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps customer to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('DEB-001')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('EUR')
  })

  it('maps totalIncl to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(6050)
  })

  it('maps vatTotal to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(1050)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(6050)
  })

  it('maps invoiceDate to postedAt as Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-07-01'))
  })

  it('returns undefined postedAt when invoiceDate is empty', () => {
    expect(transformInvoice(makeInvoice({ invoiceDate: '' })).postedAt).toBeUndefined()
  })

  it('maps status AUTHORIZED when final with full balance', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'final', balance: 6050, paidAmount: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when final and balance is zero', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'final', balance: 0 })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when final with partial payment', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'final', balance: 3000, paidAmount: 3050 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status DRAFT when concept', () => {
    expect(transformInvoice(makeInvoice({ status: 'concept' })).status).toBe('DRAFT')
  })

  it('maps status VOIDED when voided', () => {
    expect(transformInvoice(makeInvoice({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({ lines: [makeInvoiceLine()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemId).toBe('ART-100')
    expect(li.itemDescription).toBe('Consulting services')
    expect(li.unitAmount).toBe(200)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(726)
    expect(li.taxAmount).toBe(126)
    expect(li.accountId).toBe('8000')
    expect(li.taxrateId).toBe('VH')
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
