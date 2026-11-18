import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type AccountsIQExpense } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/expense'

function makeExpense(overrides: Partial<AccountsIQExpense> = {}): AccountsIQExpense {
  return {
    expenseId: '500',
    entityId: '10',
    expenseDate: '2024-03-15',
    description: 'Client entertainment',
    totalAmount: 480,
    contactId: '70',
    ...overrides,
  }
}

describe('transformExpense (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('500')
    expect(result.name).toBe('Client entertainment')
    expect(result.totalAmount).toBe(480)
    expect(result.contactId).toBe('70')
  })

  it('parses expenseDate as postedAt Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined name when description is empty', () => {
    const result = transformExpense(makeExpense({ description: '' }))
    expect(result.name).toBeUndefined()
  })

  it('returns undefined contactId when contactId is absent', () => {
    const result = transformExpense(makeExpense({ contactId: '' }))
    expect(result.contactId).toBeUndefined()
  })

  it('returns undefined postedAt when expenseDate is empty', () => {
    const result = transformExpense(makeExpense({ expenseDate: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
