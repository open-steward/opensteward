import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type MaxioExpense } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/expense'

function makeExpense(overrides: Partial<MaxioExpense> = {}): MaxioExpense {
  return {
    id: 300,
    memo: 'Office supplies',
    amount_in_cents: 4500,
    currency: 'USD',
    created_at: '2024-03-12T09:00:00Z',
    category: 'office',
    ...overrides,
  }
}

describe('transformExpense (Maxio)', () => {
  it('maps id as string', () => {
    expect(transformExpense(makeExpense()).id).toBe('300')
  })

  it('converts amount_in_cents to dollars', () => {
    expect(transformExpense(makeExpense({ amount_in_cents: 4500 })).totalAmount).toBe(45)
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('maps name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('parses created_at as Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-12T09:00:00Z'))
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
