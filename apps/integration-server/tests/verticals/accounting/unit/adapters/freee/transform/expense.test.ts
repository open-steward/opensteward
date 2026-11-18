import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type FreeeExpenseApplication } from '../../../../../../../src/verticals/accounting/adapters/freee/transform/expense'

function makeRaw(overrides: Partial<FreeeExpenseApplication> = {}): FreeeExpenseApplication {
  return {
    id: 9001,
    title: 'Business Trip Expenses',
    issue_date: '2024-07-01',
    total_amount: 15000,
    status: 'approved',
    expense_application_lines: [],
    ...overrides,
  }
}

describe('transformExpense (freee)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('9001')
    expect(result.name).toBe('Business Trip Expenses')
    expect(result.totalAmount).toBe(15000)
  })

  it('parses issue_date as Date object', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-07-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps expense_application_lines to lineItems', () => {
    const raw = makeRaw({
      expense_application_lines: [
        {
          id: 1,
          amount: 5000,
          description: 'Train tickets',
          account_item_id: 500,
        },
      ],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.totalAmount).toBe(5000)
    expect(li.itemDescription).toBe('Train tickets')
    expect(li.accountId).toBe('500')
  })

  it('handles null title', () => {
    const result = transformExpense(makeRaw({ title: null }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
