import { describe, it, expect } from 'vitest'
import {
  transformExpenseReport,
  type SoldoExpenseReport,
} from '../../../../../../../src/verticals/accounting/adapters/soldo/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeRaw(overrides: Partial<SoldoExpenseReport> = {}): SoldoExpenseReport {
  return {
    id: 'er_001',
    number: 'ER-2024-001',
    status: 'PROCESSED',
    type: 'EMPLOYEE',
    trxOwnerId: 'emp_xyz',
    totalAmount: 200.0,
    currency: 'EUR',
    toReimburse: true,
    reimbursedAmount: 200.0,
    trxDateFrom: '2024-03-01T00:00:00.000Z',
    trxDateTo: '2024-03-31T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformExpenseReport (soldo)', () => {
  it('maps id', () => {
    expect(transformExpenseReport(makeRaw()).id).toBe('er_001')
  })

  it('maps trxOwnerId to userId', () => {
    expect(transformExpenseReport(makeRaw()).userId).toBe('emp_xyz')
  })

  it('maps currency', () => {
    expect(transformExpenseReport(makeRaw()).currency).toBe('EUR')
  })

  it('converts totalAmount to minor units (200.00 → 20000)', () => {
    // Soldo major units → canonical minor units
    expect(transformExpenseReport(makeRaw({ totalAmount: 200.0 })).totalAmount).toBe(20000)
  })

  it('converts reimbursedAmount to minor units', () => {
    expect(transformExpenseReport(makeRaw({ reimbursedAmount: 50.5 })).reimbursedAmount).toBe(5050)
  })

  it('maps trxDateFrom to postedAt Date', () => {
    expect(transformExpenseReport(makeRaw()).postedAt).toEqual(new Date('2024-03-01T00:00:00.000Z'))
  })

  it('omits totalAmount when null', () => {
    expect(transformExpenseReport(makeRaw({ totalAmount: undefined })).totalAmount).toBeUndefined()
  })

  it('passes ExpenseSchema.parse without throwing', () => {
    expect(() => ExpenseSchema.parse(transformExpenseReport(makeRaw()))).not.toThrow()
  })
})
