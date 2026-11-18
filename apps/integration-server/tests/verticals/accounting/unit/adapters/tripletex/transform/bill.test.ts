import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type TripletexSupplierInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/bill'

function makeBill(overrides: Partial<TripletexSupplierInvoice> = {}): TripletexSupplierInvoice {
  return {
    id: 101,
    invoiceNumber: 'BILL-2024-001',
    supplier: { id: 50, name: 'Acme Supplies AS' },
    invoiceDate: '2024-03-01',
    paymentDueDate: '2024-03-31',
    amountCurrency: 2500,
    amountExcludingVat: 2000,
    currency: { id: '1', code: 'NOK' },
    isPaid: false,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id correctly', () => {
    expect(transformBill(makeBill()).id).toBe('101')
  })

  it('maps invoiceNumber to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2024-001')
  })

  it('maps supplier id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('50')
  })

  it('maps currency code correctly', () => {
    expect(transformBill(makeBill()).currency).toBe('NOK')
  })

  it('maps amountCurrency to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(2500)
  })

  it('parses invoiceDate as Date object', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses paymentDueDate as dueAt Date object', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-31'))
  })

  it('maps isPaid false to AUTHORIZED', () => {
    expect(transformBill(makeBill({ isPaid: false })).status).toBe('AUTHORIZED')
  })

  it('maps isPaid true to PAID', () => {
    expect(transformBill(makeBill({ isPaid: true })).status).toBe('PAID')
  })

  it('maps paymentDate to paidAt as Date object when present', () => {
    const bill = transformBill(makeBill({ isPaid: true, paymentDate: '2024-03-15' }))
    expect(bill.paidAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
