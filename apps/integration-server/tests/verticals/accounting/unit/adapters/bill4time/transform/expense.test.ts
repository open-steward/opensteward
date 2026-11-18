import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type Bill4TimeExpense,
} from '../../../../../../../src/verticals/accounting/adapters/bill4time/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeRaw(overrides: Partial<Bill4TimeExpense> = {}): Bill4TimeExpense {
  return {
    ExpenseId: 'EXP-001',
    ClientID: 'CLIENT-001',
    ProjectID: 'PROJ-001',
    UserID: 'USR-001',
    ExpenseDate: '2024-01-20',
    ExpenseCode: 'TRAVEL',
    Description: 'Client travel expenses',
    Quantity: 1,
    Rate: 150,
    Amount: 150,
    TaxAmount: 12,
    IsBillable: true,
    IsReimbursable: true,
    Reimbursed: false,
    Currency: 'USD',
    ...overrides,
  }
}

describe('transformExpense (bill4time)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('EXP-001')
    expect(result.name).toBe('Client travel expenses')
    expect(result.contactId).toBe('CLIENT-001')
    expect(result.userId).toBe('USR-001')
    expect(result.currency).toBe('USD')
    // Bill4Time passes amounts directly without minor-unit conversion
    expect(result.totalAmount).toBe(150)
    expect(result.taxAmount).toBe(12)
  })

  it('parses ExpenseDate as postedAt Date', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-20'))
  })

  it('sets reimbursedAmount to Amount when Reimbursed=true', () => {
    const result = transformExpense(makeRaw({ Reimbursed: true, Amount: 150 }))
    expect(result.reimbursedAmount).toBe(150)
  })

  it('leaves reimbursedAmount undefined when Reimbursed=false', () => {
    const result = transformExpense(makeRaw({ Reimbursed: false }))
    expect(result.reimbursedAmount).toBeUndefined()
  })

  it('falls back name to ExpenseCode when Description is missing', () => {
    const result = transformExpense(makeRaw({ Description: undefined }))
    expect(result.name).toBe('TRAVEL')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ExpenseSchema.parse without throwing', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
