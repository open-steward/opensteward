import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type TwentyFourSevenBill,
} from '../../../../../../../src/verticals/accounting/adapters/twentyfoursevenoffice/transform/bill'

function makeBill(overrides: Partial<TwentyFourSevenBill> = {}): TwentyFourSevenBill {
  return {
    id: 'bill-001',
    billNumber: 2001,
    supplierId: 'supplier-5',
    currency: 'NOK',
    billDate: '2024-02-01',
    dueDate: '2024-03-01',
    status: 'approved',
    totalAmount: 8000,
    taxAmount: 1600,
    balance: 8000,
    paidAmount: 0,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-001')
  })

  it('maps billNumber to billNumber as string', () => {
    expect(transformBill(makeBill()).billNumber).toBe('2001')
  })

  it('maps supplierId to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('supplier-5')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('NOK')
  })

  it('maps amounts correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(8000)
    expect(b.taxAmount).toBe(1600)
    expect(b.balanceAmount).toBe(8000)
  })

  it('maps billDate to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-01'))
  })

  it('returns undefined postedAt when billDate is empty', () => {
    expect(transformBill(makeBill({ billDate: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when status is draft', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when approved with full balance', () => {
    expect(
      transformBill(makeBill({ status: 'approved', balance: 8000, paidAmount: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when approved and balance is zero', () => {
    expect(
      transformBill(makeBill({ status: 'approved', balance: 0 })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when approved with partial payment', () => {
    expect(
      transformBill(makeBill({ status: 'approved', balance: 4000, paidAmount: 4000 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when status is voided', () => {
    expect(transformBill(makeBill({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps status VOIDED when status is cancelled', () => {
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
