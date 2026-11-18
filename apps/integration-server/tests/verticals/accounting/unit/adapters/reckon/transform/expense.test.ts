import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type ReckonExpense } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/expense'

function makeRaw(overrides: Partial<ReckonExpense> = {}): ReckonExpense {
  return {
    id: 'exp-001',
    date: '2024-03-20',
    totalAmount: 330,
    taxAmount: 30,
    status: 'APPROVED',
    employeeId: 'emp-001',
    description: 'Travel expenses',
    lineItems: [],
    ...overrides,
  }
}

describe('transformExpense (reckon)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('exp-001')
    expect(result.name).toBe('Travel expenses')
    expect(result.userId).toBe('emp-001')
    expect(result.totalAmount).toBe(330)
    expect(result.taxAmount).toBe(30)
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-20'))
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      lineItems: [
        {
          id: 'li-1',
          description: 'Hotel',
          quantity: 1,
          unitAmount: 300,
          amount: 300,
          taxAmount: 30,
          accountId: 'acc-600',
        },
      ],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(300)
    expect(result.lineItems![0].accountId).toBe('acc-600')
    expect(result.lineItems![0].itemDescription).toBe('Hotel')
  })

  it('passes raw as metadata identity', () => {
    const raw = makeRaw()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits taxAmount when zero', () => {
    const result = transformExpense(makeRaw({ taxAmount: 0 }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
