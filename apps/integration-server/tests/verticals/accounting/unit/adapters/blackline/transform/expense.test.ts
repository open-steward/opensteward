import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type BlacklineExpense } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/expense'

function makeExpense(overrides: Partial<BlacklineExpense> = {}): BlacklineExpense {
  return {
    expenseId: 'exp-001',
    description: 'Travel to client site',
    amount: 350,
    currency: 'USD',
    expenseDate: '2024-03-10',
    categoryId: 'cat-travel',
    submittedBy: 'user-1',
    createdAt: '2024-03-11T08:00:00Z',
    modifiedAt: '2024-03-11T08:00:00Z',
    ...overrides,
  }
}

describe('transformExpense (BlackLine)', () => {
  it('maps id from expenseId', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-001')
  })

  it('maps amount and currency', () => {
    const result = transformExpense(makeExpense())
    expect(result.totalAmount).toBe(350)
    expect(result.currency).toBe('USD')
  })

  it('maps description as name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Travel to client site')
  })

  it('parses expenseDate as Date object', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
