import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type SapB1Invoice,
  type SapB1DocumentLine,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/invoice'

function makeDocumentLine(overrides: Partial<SapB1DocumentLine> = {}): SapB1DocumentLine {
  return {
    ItemCode: 'ITEM-001',
    ItemDescription: 'Widget',
    Quantity: 5,
    UnitPrice: 100,
    LineTotal: 500,
    VatAmount: 100,
    AccountCode: 'ACCT-001',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<SapB1Invoice> = {}): SapB1Invoice {
  return {
    DocNum: 4001,
    CardCode: 'BP-001',
    DocDate: '2024-03-01',
    DocDueDate: '2024-04-01',
    DocCurrency: 'USD',
    DocTotal: 1200,
    VatSum: 200,
    PaidToDate: 0,
    DocStatus: 'O',
    Cancelled: 'N',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps DocNum as string to id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('4001')
  })

  it('maps DocNum as string to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('4001')
  })

  it('maps CardCode to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('BP-001')
  })

  it('maps DocCurrency to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps DocTotal to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1200)
  })

  it('maps VatSum to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(200)
  })

  it('maps PaidToDate to paidAmount', () => {
    expect(transformInvoice(makeInvoice()).paidAmount).toBe(0)
  })

  it('computes balanceAmount as DocTotal minus PaidToDate', () => {
    expect(transformInvoice(makeInvoice({ DocTotal: 1200, PaidToDate: 600 })).balanceAmount).toBe(600)
  })

  it('parses DocDate as Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses DocDueDate as Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps Cancelled Y to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ Cancelled: 'Y' })).status).toBe('VOIDED')
  })

  it('maps DocStatus C to PAID when not cancelled', () => {
    expect(transformInvoice(makeInvoice({ DocStatus: 'C', Cancelled: 'N' })).status).toBe('PAID')
  })

  it('maps open doc with partial payment to PARTIALLY_PAID', () => {
    expect(
      transformInvoice(makeInvoice({ DocStatus: 'O', Cancelled: 'N', PaidToDate: 600 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps open doc with no payment to AUTHORIZED', () => {
    expect(
      transformInvoice(makeInvoice({ DocStatus: 'O', Cancelled: 'N', PaidToDate: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps DocumentLines to lineItems', () => {
    const result = transformInvoice(makeInvoice({ DocumentLines: [makeDocumentLine()] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('ITEM-001')
    expect(result.lineItems![0].unitAmount).toBe(100)
    expect(result.lineItems![0].unitQuantity).toBe(5)
    expect(result.lineItems![0].totalAmount).toBe(500)
    expect(result.lineItems![0].taxAmount).toBe(100)
  })

  it('produces empty lineItems when DocumentLines is absent', () => {
    expect(transformInvoice(makeInvoice()).lineItems).toHaveLength(0)
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
