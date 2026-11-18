import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type ProfitBooksBill,
} from '../../../../../../../src/verticals/accounting/adapters/profitbooks/transform/bill'

function makeBill(overrides: Partial<ProfitBooksBill> = {}): ProfitBooksBill {
  return {
    id: 'bill-001',
    bill_number: 'BILL-2024-001',
    contact_id: 'contact-5',
    currency: 'USD',
    total_amount: 4840,
    tax_amount: 840,
    paid_amount: 0,
    balance_amount: 4840,
    date: '2024-02-01',
    due_date: '2024-03-01',
    status: 'approved',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-001')
  })

  it('maps bill_number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2024-001')
  })

  it('maps contact_id to contactId', () => {
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

  it('maps due_date to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-01'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformBill(makeBill({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps status draft to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status approved to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status partially_paid to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status cancelled to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'cancelled' })).status).toBe('VOIDED')
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
