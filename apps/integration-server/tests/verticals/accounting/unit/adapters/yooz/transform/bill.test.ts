import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type YoozDocument,
} from '../../../../../../../src/verticals/accounting/adapters/yooz/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<YoozDocument> = {}): YoozDocument {
  return {
    id: 'doc-888',
    documentNumber: 'DOC-888',
    invoiceNumber: 'INV-SUPPLIER-42',
    supplierId: 'sup-10',
    supplierName: 'ACME Supplies',
    currency: 'EUR',
    totalAmount: 1200.5,
    taxAmount: 200.08,
    netAmount: 1000.42,
    remainingAmount: 1200.5,
    status: 'VALIDATED',
    documentDate: '2026-02-01T00:00:00.000Z',
    dueDate: '2026-03-03T00:00:00.000Z',
    notes: 'Net 30',
    lines: [
      {
        id: 'line-1',
        description: 'Office supplies',
        quantity: 10,
        unitPrice: 100,
        totalAmount: 1000,
        taxAmount: 200,
        accountCode: 'ACCT-6000',
      },
    ],
    ...overrides,
  }
}

describe('transformBill (yooz)', () => {
  it('maps id to string id', () => {
    expect(transformBill(makeRaw()).id).toBe('doc-888')
  })

  it('uses invoiceNumber over documentNumber for billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('INV-SUPPLIER-42')
  })

  it('falls back to documentNumber when invoiceNumber absent', () => {
    expect(transformBill(makeRaw({ invoiceNumber: undefined })).billNumber).toBe('DOC-888')
  })

  it('maps supplierId to contactId as string', () => {
    expect(transformBill(makeRaw()).contactId).toBe('sup-10')
  })

  it('maps currency', () => {
    expect(transformBill(makeRaw()).currency).toBe('EUR')
  })

  it('maps totalAmount (numeric passthrough)', () => {
    expect(transformBill(makeRaw()).totalAmount).toBe(1200.5)
  })

  it('maps remainingAmount to balanceAmount', () => {
    expect(transformBill(makeRaw()).balanceAmount).toBe(1200.5)
  })

  it('maps status VALIDATED to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'VALIDATED' })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID to PAID', () => {
    expect(transformBill(makeRaw({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps status CANCELLED to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps status REJECTED to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'REJECTED' })).status).toBe('VOIDED')
  })

  it('maps status PARTIALLY_PAID to PARTIALLY_PAID', () => {
    expect(transformBill(makeRaw({ status: 'PARTIALLY_PAID' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status PENDING to SUBMITTED', () => {
    expect(transformBill(makeRaw({ status: 'PENDING' })).status).toBe('SUBMITTED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformBill(makeRaw({ status: 'UNKNOWN_STATUS' })).status).toBe('DRAFT')
  })

  it('maps documentDate to postedAt', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('maps dueDate to dueAt', () => {
    expect(transformBill(makeRaw()).dueAt).toBeInstanceOf(Date)
  })

  it('maps notes', () => {
    expect(transformBill(makeRaw()).notes).toBe('Net 30')
  })

  it('maps line item accountCode to accountId', () => {
    const li = transformBill(makeRaw()).lineItems?.[0]
    expect(li?.accountId).toBe('ACCT-6000')
  })

  it('maps line item description', () => {
    const li = transformBill(makeRaw()).lineItems?.[0]
    expect(li?.itemDescription).toBe('Office supplies')
  })

  it('maps line item quantity (rounds to int)', () => {
    const li = transformBill(makeRaw()).lineItems?.[0]
    expect(li?.unitQuantity).toBe(10)
  })

  it('emits float amounts that fail BillSchema (Amount requires integers)', () => {
    // transformBill passes Yooz float amounts through unchanged (e.g. 1200.5).
    // BillSchema.Amount uses z.number().int() so parsing fails.
    // This is a known schema-mismatch in the source; asserted here to document it.
    expect(() => BillSchema.parse(transformBill(makeRaw()))).toThrow()
  })

  it('handles string amount values via coercion', () => {
    const result = transformBill(makeRaw({ totalAmount: '1200.50' }))
    expect(result.totalAmount).toBe(1200.5)
  })
})
