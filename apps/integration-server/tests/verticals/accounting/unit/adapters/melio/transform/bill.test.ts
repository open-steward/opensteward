import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type MelioBill,
} from '../../../../../../../src/verticals/accounting/adapters/melio/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<MelioBill> = {}): MelioBill {
  return {
    id: 'bill_001',
    invoiceNumber: 'BILL-100',
    vendorId: 'vnd_42',
    amount: 50000, // integer minor units — Melio passes amounts through directly
    balance: 50000,
    currency: 'USD',
    status: 'AUTHORIZED',
    invoiceDate: '2024-03-01T00:00:00.000Z',
    dueDate: '2024-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformBill (melio)', () => {
  it('maps id', () => {
    expect(transformBill(makeBill()).id).toBe('bill_001')
  })

  it('maps invoiceNumber to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-100')
  })

  it('maps vendorId to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('vnd_42')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('maps amount to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(50000)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(50000)
  })

  it('sets paidAmount when paid > 0', () => {
    // total=50000, balance=20000 → paid=30000
    const result = transformBill(makeBill({ balance: 20000 }))
    expect(result.paidAmount).toBe(30000)
  })

  it('returns undefined paidAmount when fully unpaid', () => {
    const result = transformBill(makeBill({ amount: 50000, balance: 50000 }))
    expect(result.paidAmount).toBeUndefined()
  })

  it('maps invoiceDate to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01T00:00:00.000Z'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-01T00:00:00.000Z'))
  })

  it('maps status PAID', () => {
    expect(transformBill(makeBill({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps status VOIDED', () => {
    expect(transformBill(makeBill({ status: 'VOIDED' })).status).toBe('VOIDED')
  })

  it('maps status DRAFT', () => {
    expect(transformBill(makeBill({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps status PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'PARTIALLY_PAID' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps line items', () => {
    const raw = makeBill({
      lineItems: [
        { id: 'li_1', description: 'Consulting', amount: 25000, quantity: 1, unitPrice: 25000 },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('li_1')
    expect(result.lineItems![0].itemDescription).toBe('Consulting')
    expect(result.lineItems![0].totalAmount).toBe(25000)
  })

  it('maps notes', () => {
    expect(transformBill(makeBill({ notes: 'Net 30' })).notes).toBe('Net 30')
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('passes BillSchema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })
})
