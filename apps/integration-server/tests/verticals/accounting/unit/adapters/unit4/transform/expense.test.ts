import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type Unit4Expense } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/expense'

function makeExpense(overrides: Partial<Unit4Expense> = {}): Unit4Expense {
  return {
    expenseId: 'exp_001',
    postingDate: '2024-03-10',
    description: 'Conference registration',
    amount: 850,
    currencyCode: 'EUR',
    employeeId: 'emp_15',
    ...overrides,
  }
}

describe('transformExpense (Unit4)', () => {
  it('maps expenseId to string id', () => {
    expect(transformExpense(makeExpense({ expenseId: 'exp_001' })).id).toBe('exp_001')
  })

  it('maps numeric expenseId to string', () => {
    expect(transformExpense(makeExpense({ expenseId: 12 })).id).toBe('12')
  })

  it('maps amount to totalAmount', () => {
    expect(transformExpense(makeExpense({ amount: 1200 })).totalAmount).toBe(1200)
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Conference registration')
  })

  it('maps currencyCode to currency', () => {
    expect(transformExpense(makeExpense({ currencyCode: 'USD' })).currency).toBe('USD')
  })

  it('maps employeeId to contactId', () => {
    expect(transformExpense(makeExpense({ employeeId: 'emp_99' })).contactId).toBe('emp_99')
  })

  it('parses postingDate as Date', () => {
    expect(transformExpense(makeExpense({ postingDate: '2024-03-10' })).postedAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense({ expenseId: 'exp_001' }))
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
