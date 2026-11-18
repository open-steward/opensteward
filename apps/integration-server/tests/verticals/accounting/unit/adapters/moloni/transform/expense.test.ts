import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type MoloniExpense } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/expense'

function makeExpense(overrides: Partial<MoloniExpense> = {}): MoloniExpense {
  return {
    expense_id: 15,
    date: '2024-04-10',
    description: 'Office supplies',
    value: 75.5,
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('15')
    expect(result.name).toBe('Office supplies')
    expect(result.totalAmount).toBe(7550)
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-04-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense({ description: 'Travel' })
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined name when description is empty', () => {
    const result = transformExpense(makeExpense({ description: '' }))
    expect(result.name).toBeUndefined()
  })

  it('returns undefined postedAt when date is empty', () => {
    const result = transformExpense(makeExpense({ date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
