import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type ParasutExpense } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/expense'

function makeExpense(overrides: Partial<ParasutExpense> = {}): ParasutExpense {
  return {
    id: 'exp_1',
    type: 'salary_payments',
    attributes: {
      description: 'March Salary',
      amount: 15000,
      date: '2024-03-31',
      currency: 'TRY',
    },
    ...overrides,
  }
}

describe('transformExpense (parasut)', () => {
  it('maps id correctly', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp_1')
  })

  it('maps name from description', () => {
    expect(transformExpense(makeExpense()).name).toBe('March Salary')
  })

  it('maps totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(15000)
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('TRY')
  })

  it('parses date as Date object', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: ParasutExpense = { id: 'exp_2', type: 'salary_payments', attributes: {} }
    const e = transformExpense(raw)
    expect(e.id).toBe('exp_2')
    expect(e.name).toBeUndefined()
    expect(e.totalAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
