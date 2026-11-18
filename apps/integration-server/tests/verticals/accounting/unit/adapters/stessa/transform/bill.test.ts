import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type StessaBill,
} from '../../../../../../../src/verticals/accounting/adapters/stessa/transform/bill'

function makeBill(overrides: Partial<StessaBill> = {}): StessaBill {
  return {
    id: 'bill-001',
    billNumber: 'B-2024-001',
    contactId: 'contact-5',
    currency: 'USD',
    subtotal: 4000,
    taxAmount: 840,
    total: 4840,
    date: '2024-02-01',
    dueDate: '2024-03-01',
    status: 'sent',
    paidAmount: 0,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-001')
  })

  it('maps billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('B-2024-001')
  })

  it('maps contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('contact-5')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('maps amounts correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(4840)
    expect(b.taxAmount).toBe(840)
    expect(b.balanceAmount).toBe(4840)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-01'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformBill(makeBill({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when status is draft', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status SUBMITTED when status is sent with no payment', () => {
    expect(transformBill(makeBill({ status: 'sent', paidAmount: 0 })).status).toBe('SUBMITTED')
  })

  it('maps status PAID when status is paid', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when status is sent with partial payment', () => {
    expect(
      transformBill(makeBill({ status: 'sent', paidAmount: 2000, total: 4840 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status OVERDUE when status is overdue', () => {
    expect(transformBill(makeBill({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps status VOIDED when status is void', () => {
    expect(transformBill(makeBill({ status: 'void' })).status).toBe('VOIDED')
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
