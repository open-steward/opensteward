import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type GustoExpense } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/expense'

function makeExpense(overrides: Partial<GustoExpense> = {}): GustoExpense {
  return {
    id: 'exp_001',
    date: '2024-03-10',
    description: 'Travel reimbursement',
    amount: 350,
    employee_id: 'emp_42',
    category: 'travel',
    ...overrides,
  }
}

describe('transformExpense (Gusto)', () => {
  it('maps id to string', () => {
    expect(transformExpense(makeExpense({ id: 'exp_001' })).id).toBe('exp_001')
  })

  it('maps numeric id to string', () => {
    expect(transformExpense(makeExpense({ id: 7 })).id).toBe('7')
  })

  it('maps amount to totalAmount', () => {
    expect(transformExpense(makeExpense({ amount: 500 })).totalAmount).toBe(500)
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Travel reimbursement')
  })

  it('maps employee_id to contactId', () => {
    expect(transformExpense(makeExpense({ employee_id: 'emp_99' })).contactId).toBe('emp_99')
  })

  it('parses date as Date object', () => {
    expect(transformExpense(makeExpense({ date: '2024-03-10' })).postedAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense({ id: 'exp_001' }))
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
