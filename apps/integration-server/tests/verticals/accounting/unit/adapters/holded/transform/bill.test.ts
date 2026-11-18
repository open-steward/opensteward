import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type HoldedBill,
} from '../../../../../../../src/verticals/accounting/adapters/holded/transform/bill'

function makeBill(overrides: Partial<HoldedBill> = {}): HoldedBill {
  return {
    id: 'bill-001',
    invoiceNum: 'P-2024-001',
    contact: 'contact-5',
    currency: 'EUR',
    subtotal: 4000,
    tax: 840,
    total: 4840,
    date: 1706745600, // 2024-02-01
    dueDate: 1709251200, // 2024-03-01
    status: 1,
    paid: 0,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-001')
  })

  it('maps invoiceNum to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('P-2024-001')
  })

  it('maps contact to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('contact-5')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('EUR')
  })

  it('maps amounts correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(4840)
    expect(b.taxAmount).toBe(840)
    expect(b.balanceAmount).toBe(4840)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date(1706745600 * 1000))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date(1709251200 * 1000))
  })

  it('returns undefined postedAt when date is 0', () => {
    expect(transformBill(makeBill({ date: 0 })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when status is 0', () => {
    expect(transformBill(makeBill({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when status is 1 with no payment', () => {
    expect(transformBill(makeBill({ status: 1, paid: 0 })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID when status is 2', () => {
    expect(transformBill(makeBill({ status: 2 })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when status is 1 with partial payment', () => {
    expect(
      transformBill(makeBill({ status: 1, paid: 2000, total: 4840 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when status is 4', () => {
    expect(transformBill(makeBill({ status: 4 })).status).toBe('VOIDED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
