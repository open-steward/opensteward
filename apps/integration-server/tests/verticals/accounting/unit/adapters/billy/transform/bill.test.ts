import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type BillyBill,
} from '../../../../../../../src/verticals/accounting/adapters/billy/transform/bill'

function makeBill(overrides: Partial<BillyBill> = {}): BillyBill {
  return {
    id: 'bill-001',
    voucherNo: 2001,
    contactId: 'contact-5',
    currencyId: 'DKK',
    entryDate: '2024-02-01',
    dueDate: '2024-03-01',
    state: 'approved',
    grossAmount: 5000,
    taxAmount: 1000,
    balance: 5000,
    paidAmount: 0,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-001')
  })

  it('maps voucherNo to billNumber as string', () => {
    expect(transformBill(makeBill()).billNumber).toBe('2001')
  })

  it('maps contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('contact-5')
  })

  it('maps currencyId to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('DKK')
  })

  it('maps amounts correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(5000)
    expect(b.taxAmount).toBe(1000)
    expect(b.balanceAmount).toBe(5000)
  })

  it('maps entryDate to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-01'))
  })

  it('returns undefined postedAt when entryDate is empty', () => {
    expect(transformBill(makeBill({ entryDate: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when state is not approved or voided', () => {
    expect(transformBill(makeBill({ state: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when approved with full balance', () => {
    expect(
      transformBill(makeBill({ state: 'approved', balance: 5000, paidAmount: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when approved and balance is zero', () => {
    expect(
      transformBill(makeBill({ state: 'approved', balance: 0 })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when approved with partial payment', () => {
    expect(
      transformBill(makeBill({ state: 'approved', balance: 3000, paidAmount: 2000 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when state is voided', () => {
    expect(transformBill(makeBill({ state: 'voided' })).status).toBe('VOIDED')
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
