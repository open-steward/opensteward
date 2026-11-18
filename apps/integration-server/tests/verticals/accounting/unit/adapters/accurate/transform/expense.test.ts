import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type AccurateExpense } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/expense'

function makeExpense(overrides: Partial<AccurateExpense> = {}): AccurateExpense {
  return {
    id: 7001,
    date: '2024-07-10',
    description: 'Biaya perjalanan dinas',
    totalAmount: 500000,
    employeeNo: 'EMP-001',
    ...overrides,
  }
}

describe('transformExpense (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('7001')
    expect(result.name).toBe('Biaya perjalanan dinas')
    expect(result.totalAmount).toBe(500000)
    expect(result.userId).toBe('EMP-001')
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-07-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles null description', () => {
    const result = transformExpense(makeExpense({ description: null }))
    expect(result.name).toBeUndefined()
  })

  it('handles null employeeNo', () => {
    const result = transformExpense(makeExpense({ employeeNo: null }))
    expect(result.userId).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
