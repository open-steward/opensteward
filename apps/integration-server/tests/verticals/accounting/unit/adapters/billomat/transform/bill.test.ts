import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type BillomatBill,
} from '../../../../../../../src/verticals/accounting/adapters/billomat/transform/bill'

function makeBill(overrides: Partial<BillomatBill> = {}): BillomatBill {
  return {
    id: 'bill-001',
    bill_number: 'ER-2001',
    supplier_id: 'supplier-5',
    currency_code: 'EUR',
    date: '2024-02-01',
    due_date: '2024-03-01',
    status: 'OPEN',
    total_gross: 5950,
    total_net: 5000,
    tax_amount: 950,
    paid_amount: 0,
    open_amount: 5950,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-001')
  })

  it('maps bill_number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('ER-2001')
  })

  it('maps supplier_id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('supplier-5')
  })

  it('maps currency_code to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('EUR')
  })

  it('maps amounts correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(5950)
    expect(b.taxAmount).toBe(950)
    expect(b.balanceAmount).toBe(5950)
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

  it('maps status DRAFT when status is DRAFT', () => {
    expect(transformBill(makeBill({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when OPEN with no payment', () => {
    expect(
      transformBill(makeBill({ status: 'OPEN', paid_amount: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when status is PAID', () => {
    expect(
      transformBill(makeBill({ status: 'PAID' })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when OPEN with partial payment', () => {
    expect(
      transformBill(makeBill({ status: 'OPEN', paid_amount: 2000, open_amount: 3950 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when CANCELED', () => {
    expect(transformBill(makeBill({ status: 'CANCELED' })).status).toBe('VOIDED')
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
