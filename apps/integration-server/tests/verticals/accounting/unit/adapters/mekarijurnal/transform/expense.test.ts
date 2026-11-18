import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type MekariJurnalExpense } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/expense'

function makeExpense(overrides: Partial<MekariJurnalExpense> = {}): MekariJurnalExpense {
  return {
    id: 77,
    date: '2024-05-10',
    description: 'Office supplies',
    amount: 150000,
    currency_code: 'IDR',
    account_id: 2001,
    ...overrides,
  }
}

describe('transformExpense (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('77')
    expect(result.name).toBe('Office supplies')
    expect(result.totalAmount).toBe(150000)
    expect(result.currency).toBe('IDR')
    expect(result.accountId).toBe('2001')
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-05-10'))
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

  it('handles null account_id', () => {
    const result = transformExpense(makeExpense({ account_id: null }))
    expect(result.accountId).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
