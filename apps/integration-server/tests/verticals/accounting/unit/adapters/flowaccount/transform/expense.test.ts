import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type FlowAccountExpense } from '../../../../../../../src/verticals/accounting/adapters/flowaccount/transform/expense'

function makeExpense(overrides: Partial<FlowAccountExpense> = {}): FlowAccountExpense {
  return {
    id: 800,
    date: '2024-01-18',
    description: 'Client entertainment',
    amount: 2500,
    categoryName: 'Entertainment',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('800')
    expect(result.name).toBe('Client entertainment')
    expect(result.totalAmount).toBe(2500)
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-01-18'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('falls back to categoryName when description is empty', () => {
    const result = transformExpense(makeExpense({ description: '' }))
    expect(result.name).toBe('Entertainment')
  })

  it('returns undefined name when both description and categoryName are empty', () => {
    const result = transformExpense(makeExpense({ description: '', categoryName: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
