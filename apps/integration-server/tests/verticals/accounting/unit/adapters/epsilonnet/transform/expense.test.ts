import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type EpsilonNetExpense } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/expense'

function makeExpense(overrides: Partial<EpsilonNetExpense> = {}): EpsilonNetExpense {
  return {
    id: '4001',
    date: '2024-03-05',
    description: 'Office supplies',
    amount: 150,
    categoryId: '10',
    ...overrides,
  }
}

describe('transformExpense (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('4001')
    expect(result.totalAmount).toBe(150)
    expect(result.name).toBe('Office supplies')
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing description gracefully', () => {
    const result = transformExpense(makeExpense({ description: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
