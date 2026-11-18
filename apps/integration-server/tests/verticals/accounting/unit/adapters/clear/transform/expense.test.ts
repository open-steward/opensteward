import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type ClearExpense,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/expense'

function makeRaw(overrides: Partial<ClearExpense> = {}): ClearExpense {
  return {
    id: 'exp-uuid-001',
    expense_number: 'EXP/2024/001',
    date: '2024-03-10',
    total_amount: 5000,
    tax_amount: 900,
    status: 'approved',
    employee_id: 'emp-uuid-001',
    description: 'Conference travel expenses',
    line_items: [],
    ...overrides,
  }
}

describe('transformExpense (clear)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('exp-uuid-001')
    expect(result.name).toBe('EXP/2024/001')
    expect(result.userId).toBe('emp-uuid-001')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(900)
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits taxAmount when zero', () => {
    const result = transformExpense(makeRaw({ tax_amount: 0 }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('maps line_items to lineItems', () => {
    const raw = makeRaw({
      line_items: [
        {
          id: 'li-001',
          description: 'Flight ticket',
          quantity: 1,
          unit_price: 5000,
          tax_amount: 900,
          total_amount: 5900,
          account_id: 'acc-travel',
        },
      ],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('li-001')
    expect(result.lineItems![0].totalAmount).toBe(5900)
    expect(result.lineItems![0].taxAmount).toBe(900)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
