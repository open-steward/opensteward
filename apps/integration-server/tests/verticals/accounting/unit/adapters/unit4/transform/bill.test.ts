import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type Unit4Bill } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/bill'

function makeBill(overrides: Partial<Unit4Bill> = {}): Unit4Bill {
  return {
    invoiceId: 'bill_001',
    invoiceNumber: 'BILL-2024-001',
    status: 'Draft',
    supplierId: 'supp_10',
    amount: 3000,
    taxAmount: 600,
    currencyCode: 'EUR',
    postingDate: '2024-03-05',
    dueDate: '2024-04-05',
    lines: [],
    ...overrides,
  }
}

describe('transformBill (Unit4)', () => {
  it('maps invoiceId to string id', () => {
    expect(transformBill(makeBill({ invoiceId: 'bill_001' })).id).toBe('bill_001')
  })

  it('maps numeric invoiceId to string', () => {
    expect(transformBill(makeBill({ invoiceId: 42 })).id).toBe('42')
  })

  it('maps invoiceNumber to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2024-001')
  })

  it('maps amount to totalAmount', () => {
    expect(transformBill(makeBill({ amount: 4500 })).totalAmount).toBe(4500)
  })

  it('maps supplierId to contactId', () => {
    expect(transformBill(makeBill({ supplierId: 'supp_99' })).contactId).toBe('supp_99')
  })

  it('maps currencyCode to currency', () => {
    expect(transformBill(makeBill({ currencyCode: 'GBP' })).currency).toBe('GBP')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Posted status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'Posted' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformBill(makeBill({ status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('parses postingDate as Date', () => {
    expect(transformBill(makeBill({ postingDate: '2024-03-05' })).postedAt).toEqual(new Date('2024-03-05'))
  })

  it('parses dueDate as Date', () => {
    expect(transformBill(makeBill({ dueDate: '2024-04-05' })).dueAt).toEqual(new Date('2024-04-05'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill({ invoiceId: 'bill_001' }))
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
