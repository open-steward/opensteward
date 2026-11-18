import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type ManagerExpenseClaim,
} from '../../../../../../../src/verticals/accounting/adapters/manager/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeExpense(overrides: Partial<ManagerExpenseClaim> = {}): ManagerExpenseClaim {
  return {
    key: 'exp-key-1',
    date: '2024-08-15',
    reference: 'EXP-001',
    paidBy: 'employee-uuid',
    payee: 'supplier-uuid',
    description: 'Business travel',
    amount: { value: 450.0, currency: 'USD' },
    lines: [
      {
        account: 'acct-travel',
        lineDescription: 'Taxi fare',
        qty: 1,
        unitPrice: 450.0,
        amount: { value: 450.0, currency: 'USD' },
      },
    ],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps key to id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-key-1')
  })

  it('maps paidBy to userId', () => {
    expect(transformExpense(makeExpense()).userId).toBe('employee-uuid')
  })

  it('maps payee to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('supplier-uuid')
  })

  it('maps first line account to accountId', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('acct-travel')
  })

  it('converts amount to minor units', () => {
    // 450.0 → 45000
    expect(transformExpense(makeExpense()).totalAmount).toBe(45000)
  })

  it('maps currency from amount.currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('parses date as postedAt', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-08-15'))
  })

  it('maps lines to lineItems', () => {
    const result = transformExpense(makeExpense())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('acct-travel')
    expect(result.lineItems![0].itemDescription).toBe('Taxi fare')
    expect(result.lineItems![0].totalAmount).toBe(45000)
  })

  it('passes schema validation', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeExpense()))).not.toThrow()
  })
})
