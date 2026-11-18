import { describe, it, expect } from 'vitest'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/payhawk/transform/bill'
import type { PayhawkExpense } from '../../../../../../../src/verticals/accounting/adapters/payhawk/transform/expense'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<PayhawkExpense> = {}): PayhawkExpense {
  return {
    id: 'exp-bill-1',
    reconciliationId: 'BILL-001',
    status: 'approved',
    currency: 'EUR',
    amount: 200,
    totalAmount: 242,
    taxAmount: 42,
    documentDate: '2025-06-01',
    dueDate: '2025-07-01',
    createdAt: '2025-06-01T10:00:00.000Z',
    updatedAt: '2025-06-02T10:00:00.000Z',
    supplier: { id: 'supp-99', name: 'ACME Supplies' },
    lines: [
      {
        id: 'line-1',
        amount: 200,
        taxAmount: 42,
        accountId: 'acct-5',
        categoryName: 'Office Supplies',
        taxRate: { id: 'vat-20' },
      },
    ],
    documents: [
      {
        id: 'doc-1',
        url: 'https://example.com/doc.pdf',
        mimeType: 'application/pdf',
        fileName: 'invoice.pdf',
      },
    ],
    ...overrides,
  }
}

describe('payhawk transformBill', () => {
  it('maps id directly', () => {
    expect(transformBill(makeRaw()).id).toBe('exp-bill-1')
  })

  it('maps approved status to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps reviewed status to SUBMITTED', () => {
    expect(transformBill(makeRaw({ status: 'reviewed' })).status).toBe('SUBMITTED')
  })

  it('maps rejected status to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'rejected' })).status).toBe('VOIDED')
  })

  it('maps deleted status to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'deleted' })).status).toBe('VOIDED')
  })

  it('maps reconciliationId to billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('BILL-001')
  })

  it('maps supplier.id to contactId', () => {
    expect(transformBill(makeRaw()).contactId).toBe('supp-99')
  })

  it('maps totalAmount to minor units', () => {
    expect(transformBill(makeRaw({ totalAmount: 242 })).totalAmount).toBe(24200)
  })

  it('falls back to amount when totalAmount is absent', () => {
    expect(transformBill(makeRaw({ totalAmount: undefined, amount: 200 })).totalAmount).toBe(20000)
  })

  it('maps taxAmount to minor units', () => {
    expect(transformBill(makeRaw()).taxAmount).toBe(4200)
  })

  it('maps line itemDescription from categoryName', () => {
    const result = transformBill(makeRaw())
    expect(result.lineItems?.[0]?.itemDescription).toBe('Office Supplies')
  })

  it('maps line taxrateId', () => {
    const result = transformBill(makeRaw())
    expect(result.lineItems?.[0]?.taxrateId).toBe('vat-20')
  })

  it('maps attachment url', () => {
    const result = transformBill(makeRaw())
    expect(result.attachments?.[0]?.url).toBe('https://example.com/doc.pdf')
  })

  it('maps documentDate to postedAt', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('passes BillSchema.parse', () => {
    expect(() => BillSchema.parse(transformBill(makeRaw()))).not.toThrow()
  })
})
