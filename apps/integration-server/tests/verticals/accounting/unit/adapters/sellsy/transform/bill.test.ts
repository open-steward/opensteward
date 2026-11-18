import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type SellsyBill,
} from '../../../../../../../src/verticals/accounting/adapters/sellsy/transform/bill'

function makeBill(overrides: Partial<SellsyBill> = {}): SellsyBill {
  return {
    id: 'bill-001',
    number: 'ACHAT-2024-001',
    contact_id: 'supplier-1',
    currency: 'EUR',
    date: '2024-02-10',
    due_date: '2024-03-10',
    status: 'approved',
    total_amount: 5000,
    tax_amount: 1000,
    paid_amount: 0,
    remaining_amount: 5000,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-001')
  })

  it('maps number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('ACHAT-2024-001')
  })

  it('maps contact_id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('supplier-1')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('EUR')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(5000)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(1000)
  })

  it('maps remaining_amount to balanceAmount', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(5000)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-02-10'))
  })

  it('maps due_date to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-10'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformBill(makeBill({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when status is draft', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when approved with full remaining', () => {
    expect(
      transformBill(makeBill({ status: 'approved', remaining_amount: 5000, paid_amount: 0 }))
        .status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when approved and remaining is zero', () => {
    expect(
      transformBill(makeBill({ status: 'paid' })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when approved with partial payment', () => {
    expect(
      transformBill(makeBill({ status: 'approved', remaining_amount: 2500, paid_amount: 2500 }))
        .status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when cancelled', () => {
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
