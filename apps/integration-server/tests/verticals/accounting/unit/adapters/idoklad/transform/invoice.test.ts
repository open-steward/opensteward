import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type IdokladInvoice } from '../../../../../../../src/verticals/accounting/adapters/idoklad/transform/invoice'

function makeInvoice(overrides: Partial<IdokladInvoice> = {}): IdokladInvoice {
  return {
    Id: '1',
    DocumentNumber: 'FAK2024-001',
    DateOfIssue: '2024-01-15',
    DateOfMaturity: '2024-02-15',
    TotalWithVat: 1210,
    TotalVat: 210,
    DocumentStatus: 2,
    PurchaserId: '42',
    CurrencyId: 'CZK',
    IssuedInvoiceItems: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps Id to string id', () => {
    expect(transformInvoice(makeInvoice({ Id: 99 })).id).toBe('99')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice number from DocumentNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('FAK2024-001')
  })

  it('maps total amount from TotalWithVat', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1210)
  })

  it('maps tax amount from TotalVat', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(210)
  })

  it('maps DRAFT status for DocumentStatus 1', () => {
    expect(transformInvoice(makeInvoice({ DocumentStatus: 1 })).status).toBe('DRAFT')
  })

  it('maps DRAFT status for undefined DocumentStatus', () => {
    expect(transformInvoice(makeInvoice({ DocumentStatus: undefined })).status).toBe('DRAFT')
  })

  it('maps AUTHORIZED status for DocumentStatus 2', () => {
    expect(transformInvoice(makeInvoice({ DocumentStatus: 2 })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status for DocumentStatus 3', () => {
    expect(transformInvoice(makeInvoice({ DocumentStatus: 3 })).status).toBe('PAID')
  })

  it('maps VOIDED status for DocumentStatus 4', () => {
    expect(transformInvoice(makeInvoice({ DocumentStatus: 4 })).status).toBe('VOIDED')
  })

  it('maps contactId from PurchaserId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('maps currency from CurrencyId', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('CZK')
  })

  it('maps postedAt from DateOfIssue', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toBeInstanceOf(Date)
  })

  it('maps dueAt from DateOfMaturity', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-02-15'))
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice({ Id: 99 }))
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
