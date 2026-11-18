import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type ProsvasisExpense } from '../../../../../../../src/verticals/accounting/adapters/prosvasis/transform/expense'

function makeExpense(overrides: Partial<ProsvasisExpense> = {}): ProsvasisExpense {
  return {
    id: '4001',
    Date: '2024-03-05',
    Description: 'Stationery',
    Amount: 75,
    CategoryId: '5',
    ...overrides,
  }
}

describe('transformExpense (Prosvasis)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('4001')
    expect(result.totalAmount).toBe(75)
    expect(result.name).toBe('Stationery')
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
    const result = transformExpense(makeExpense({ Description: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
