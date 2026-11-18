import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type FinlyBill,
} from '../../../../../../../src/verticals/accounting/adapters/finly/transform/bill'

function makeBill(overrides: Partial<FinlyBill> = {}): FinlyBill {
  return {
    id: 'bill-001',
    bill_number: 'BILL-2024-001',
    vendor_id: 'vendor-5',
    currency: 'USD',
    subtotal: 4000,
    tax_amount: 840,
    total_amount: 4840,
    date: '2024-02-01',
    due_date: '2024-03-01',
    status: 'pending_approval',
    paid_amount: 0,
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

  it('maps vendor_id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('vendor-5')
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

  it('maps status DRAFT when status is draft', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status SUBMITTED when status is pending_approval', () => {
    expect(transformBill(makeBill({ status: 'pending_approval' })).status).toBe('SUBMITTED')
  })

  it('maps status AUTHORIZED when status is approved', () => {
    expect(transformBill(makeBill({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID when status is paid', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when status is partially_paid', () => {
    expect(transformBill(makeBill({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when status is void', () => {
    expect(transformBill(makeBill({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps status VOIDED when status is rejected', () => {
    expect(transformBill(makeBill({ status: 'rejected' })).status).toBe('VOIDED')
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
